/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The currency a listing's price is in, through the listings table.
 *
 * Stored with the row, and read back by everything that prints or compares a price. Nothing converts
 * between currencies, so a price bound only ever applies to listings in one of them, and the
 * affordability band - euros, out of a German finance model - never takes in a franc listing.
 */

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params) => db.prepare(sql).all(params ?? {}),
    execute: (sql, params) => db.prepare(sql).run(params ?? {}),
    withTransaction: (fn) => db.transaction(fn)(db),
  },
}));
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const USER = 'user-1';

describe('listing currency in the listings table', () => {
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        shared_with_user TEXT DEFAULT '[]',
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        hash TEXT,
        provider TEXT,
        job_id TEXT,
        price REAL,
        currency TEXT NOT NULL DEFAULT 'EUR',
        charges_included INTEGER,
        charges REAL,
        size REAL,
        rooms REAL,
        build_year INTEGER,
        energy_class TEXT,
        title TEXT,
        image_url TEXT,
        description TEXT,
        address TEXT,
        link TEXT,
        status TEXT,
        distances TEXT,
        created_at INTEGER DEFAULT 0,
        published_at INTEGER,
        is_active INTEGER DEFAULT 1,
        manually_deleted INTEGER DEFAULT 0,
        latitude REAL,
        longitude REAL,
        price_per_sqm REAL,
        last_price_check_at INTEGER,
        UNIQUE (job_id, hash)
      );
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (id TEXT PRIMARY KEY, listing_id TEXT NOT NULL);
      CREATE TABLE listing_travel_times (
        listing_id TEXT NOT NULL,
        label TEXT NOT NULL,
        origin_lat REAL,
        origin_lng REAL,
        transit_minutes INTEGER,
        transit_transfers INTEGER,
        car_minutes INTEGER,
        car_distance_meters INTEGER,
        car_geometry TEXT,
        bike_minutes INTEGER,
        walk_minutes INTEGER,
        is_estimate INTEGER NOT NULL DEFAULT 1,
        reference_time INTEGER,
        computed_at INTEGER,
        PRIMARY KEY (listing_id, label)
      );
    `);
    db.prepare(`INSERT INTO jobs (id, user_id, name, deal_type) VALUES ('job-rent', ?, 'Renting', 'rent')`).run(USER);

    vi.resetModules();
    listingsStorage = await import('../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const listing = (hash, overrides = {}) => ({
    id: hash,
    price: 1200,
    size: 60,
    rooms: 2,
    title: `Flat ${hash}`,
    image: null,
    description: 'nice',
    address: 'Somewhere 1',
    link: `https://example.com/${hash}`,
    latitude: 47.37,
    longitude: 8.54,
    ...overrides,
  });

  const store = (...listings) => listingsStorage.storeListings('job-rent', 'some-provider', listings);
  const currencyOf = (hash) => db.prepare(`SELECT currency FROM listings WHERE hash = ?`).get(hash).currency;

  describe('storeListings', () => {
    it('stores the currency the pipeline set, and hands the normalised code back', () => {
      const swiss = listing('zh', { currency: 'chf' });
      store(swiss);
      expect(currencyOf('zh')).toBe('CHF');
      expect(swiss.currency).toBe('CHF');
    });

    it('stores euros for a listing that carries none', () => {
      store(listing('de'));
      expect(currencyOf('de')).toBe('EUR');
    });
  });

  describe('queryListings price bounds', () => {
    beforeEach(() => {
      store(
        listing('eur-cheap', { price: 900 }),
        listing('eur-dear', { price: 2500 }),
        listing('chf-cheap', { price: 1400, currency: 'CHF' }),
        listing('chf-dear', { price: 2800, currency: 'CHF' }),
      );
    });

    /** @returns {string[]} The titles the query returned, sorted. */
    const titles = (filters) =>
      listingsStorage
        .queryListings({ ...filters, userId: USER, isAdmin: true, pageSize: 100 })
        .result.map((row) => row.title.replace('Flat ', ''))
        .sort();

    it('returns every currency, each row with its own, when no price is bounded', () => {
      const rows = listingsStorage.queryListings({ userId: USER, isAdmin: true }).result;
      expect(rows).toHaveLength(4);
      expect(rows.find((row) => row.title === 'Flat chf-dear').currency).toBe('CHF');
    });

    // "At most 1.500" cannot be applied to a rent in francs as if the numbers meant the same thing.
    it('applies a bound without a currency to euros only', () => {
      expect(titles({ maxPrice: 1500 })).toEqual(['eur-cheap']);
      expect(titles({ minPrice: 1000 })).toEqual(['eur-dear']);
    });

    it('applies a bound in the currency it was given in', () => {
      expect(titles({ maxPrice: 1500, currencyFilter: 'CHF' })).toEqual(['chf-cheap']);
      expect(titles({ minPrice: 2000, currencyFilter: 'chf' })).toEqual(['chf-dear']);
    });

    it('narrows to one currency without a bound', () => {
      expect(titles({ currencyFilter: 'CHF' })).toEqual(['chf-cheap', 'chf-dear']);
    });
  });

  // The band's windows are euros, from a German finance model.
  it('never puts a listing in another currency into an affordability band', () => {
    store(listing('eur', { price: 700 }), listing('chf', { price: 700, currency: 'CHF' }));
    const band = { buy: null, rent: { minExclusive: 0, max: 1120 } };

    const rows = listingsStorage.queryListings({ affordabilityBand: band, userId: USER, isAdmin: true }).result;
    expect(rows.map((row) => row.title)).toEqual(['Flat eur']);
  });

  it('carries the currency to the map and to the price tracker', () => {
    store(listing('zh', { currency: 'CHF' }));

    const [pin] = listingsStorage.getListingsForMap({ isAdmin: true }).listings;
    expect(pin.currency).toBe('CHF');

    // A price change is notified in the listing's currency, so the probe hands it on.
    const [due] = listingsStorage.getListingsDueForPriceCheck({ now: Date.now() });
    expect(due.currency).toBe('CHF');
  });
});
