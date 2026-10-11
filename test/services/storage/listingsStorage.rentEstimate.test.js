/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { MIN_SAMPLE } from '../../../lib/services/listings/marketBenchmark.js';
import { MAX_COLD_RENT_OVERRIDE } from '../../../lib/services/finance/rentalYield.js';

/**
 * The rent estimate against the real query.
 *
 * The radius logic is the market benchmark's and tested there. What is left is what only the SQL can
 * get wrong: that a purchase is priced on rentals and never on other purchases, and that the rent it
 * is priced on is the cold one.
 */
describe('rent estimate against the listings table', () => {
  let db;
  let listingsStorage;

  /** Cologne cathedral. */
  const LAT = 50.9413;
  const LNG = 6.958;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        deal_type TEXT
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        price INTEGER,
        size INTEGER,
        charges_included INTEGER,
        charges REAL,
        latitude REAL,
        longitude REAL,
        manually_deleted INTEGER DEFAULT 0,
        rent_median_sqm REAL,
        rent_sample_size INTEGER,
        rent_radius_km REAL,
        cold_rent_override REAL
      );
    `);
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('rent-job', 'rent')`).run();
    db.prepare(`INSERT INTO jobs (id, deal_type) VALUES ('buy-job', 'buy')`).run();

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params),
        execute: (sql, params) => db.prepare(sql).run(params),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => {
    db.close();
  });

  /**
   * @param {string} id
   * @param {Object} options
   * @param {string} [options.jobId='rent-job']
   * @param {number} [options.price=500]
   * @param {number} [options.size=50]
   * @param {number|null} [options.chargesIncluded=null]
   * @param {number|null} [options.charges=null]
   * @param {number} [options.km=1] Kilometres due north of the cathedral.
   * @param {number} [options.deleted=0]
   */
  const addListing = (
    id,
    { jobId = 'rent-job', price = 500, size = 50, chargesIncluded = null, charges = null, km = 1, deleted = 0 } = {},
  ) =>
    db
      .prepare(
        `INSERT INTO listings (id, job_id, price, size, charges_included, charges, latitude, longitude, manually_deleted)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run(id, jobId, price, size, chargesIncluded, charges, LAT + km / 111.32, LNG, deleted);

  const rowOf = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);

  /** The purchase being estimated, at the cathedral itself. */
  const target = () => {
    addListing('target', { jobId: 'buy-job', price: 250000, size: 60, km: 0 });
    return { id: 'target', latitude: LAT, longitude: LNG };
  };

  it('writes the median cold rent per square metre of the rentals nearby onto row and object', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`rental-${index}`, { price: 500 });
    }
    const listing = target();

    listingsStorage.applyRentEstimate([listing]);

    const row = rowOf('target');
    expect(row.rent_median_sqm).toBe(10);
    expect(row.rent_sample_size).toBe(MIN_SAMPLE);
    expect(row.rent_radius_km).toBe(5);
    // The yield filter that runs next reads the object, not the row.
    expect(listing.rent_median_sqm).toBe(10);
  });

  it('never prices a purchase on other purchases', () => {
    for (let index = 0; index < MIN_SAMPLE * 2; index += 1) {
      addListing(`purchase-${index}`, { jobId: 'buy-job', price: 250000 });
    }
    const listing = target();

    listingsStorage.applyRentEstimate([listing]);

    expect(rowOf('target').rent_median_sqm).toBeNull();
    expect(listing.rent_median_sqm).toBeUndefined();
  });

  // A yield is computed on the Kaltmiete. A warm rent with its charges stated is brought down to the
  // cold one; a warm rent with nothing said about the charges is left out rather than guessed at.
  it('reads the cold rent, and leaves out warm rents it cannot split', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`warm-stated-${index}`, { price: 650, chargesIncluded: 1, charges: 150 });
    }
    for (let index = 0; index < MIN_SAMPLE * 2; index += 1) {
      addListing(`warm-unknown-${index}`, { price: 2000, chargesIncluded: 1 });
    }
    target();

    listingsStorage.applyRentEstimate([{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').rent_median_sqm).toBe(10);
    expect(rowOf('target').rent_sample_size).toBe(MIN_SAMPLE);
  });

  it('gives no estimate on too few rentals, rather than one built on a handful', () => {
    for (let index = 0; index < MIN_SAMPLE - 1; index += 1) {
      addListing(`rental-${index}`);
    }
    target();

    listingsStorage.applyRentEstimate([{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').rent_median_sqm).toBeNull();
  });

  it('ignores soft-deleted rentals, which are duplicates of rentals already counted', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`rental-${index}`, { price: 500 });
    }
    for (let index = 0; index < MIN_SAMPLE * 3; index += 1) {
      addListing(`tombstone-${index}`, { price: 2000, deleted: 1 });
    }
    target();

    listingsStorage.applyRentEstimate([{ id: 'target', latitude: LAT, longitude: LNG }]);

    expect(rowOf('target').rent_median_sqm).toBe(10);
  });

  it('skips a listing that has no position', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      addListing(`rental-${index}`);
    }
    target();

    listingsStorage.applyRentEstimate([{ id: 'target', latitude: null, longitude: null }]);

    expect(rowOf('target').rent_median_sqm).toBeNull();
  });

  describe('setColdRentOverride', () => {
    it('stores a monthly cold rent and clears it again', () => {
      target();

      expect(listingsStorage.setColdRentOverride('target', 850)).toBe(1);
      expect(rowOf('target').cold_rent_override).toBe(850);

      expect(listingsStorage.setColdRentOverride('target', null)).toBe(1);
      expect(rowOf('target').cold_rent_override).toBeNull();
    });

    it('reports a listing that does not exist', () => {
      expect(listingsStorage.setColdRentOverride('missing', 850)).toBe(0);
      expect(listingsStorage.setColdRentOverride(null, 850)).toBe(0);
    });

    it('refuses anything that is not a plausible monthly rent', () => {
      target();
      for (const value of [0, -100, 'abc', MAX_COLD_RENT_OVERRIDE + 1]) {
        expect(() => listingsStorage.setColdRentOverride('target', value)).toThrow();
      }
      expect(rowOf('target').cold_rent_override).toBeNull();
    });
  });
});
