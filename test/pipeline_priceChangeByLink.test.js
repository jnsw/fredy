/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as priceHistoryMigration } from '../lib/services/storage/migrations/sql/28.price-history.js';

/**
 * An advert whose price changed, seen by the next search.
 *
 * Nearly every provider builds a listing's hash over the portal's advert id *and its price*
 * (`buildHash(o.id, o.price)`), and the novelty check only compares hashes. So the same advert at a
 * new price hashed differently, passed as new, was stored as a second row next to the one that
 * already carried its link - with its stale price still showing - and was announced as a new listing.
 *
 * Runs the real novelty check against the real listing storage and the real price history service on
 * an in-memory database; only the notification fan-out and the settings are stood in for.
 */

const JOB = 'job-1';
const PROVIDER = 'kleinanzeigen';
const SEARCH_URL = 'https://www.kleinanzeigen.de/s-wohnung-mieten/berlin/c203l3331';

let db;
let settings;
let sendPriceChange;
let send;
let storage;
let Pipeline;

beforeEach(async () => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      hash TEXT,
      provider TEXT,
      job_id TEXT,
      price REAL,
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
      created_at INTEGER,
      published_at INTEGER,
      is_active INTEGER,
      manually_deleted INTEGER DEFAULT 0,
      latitude REAL,
      longitude REAL,
      distances TEXT,
      notes TEXT,
      status TEXT,
      price_per_sqm REAL,
      UNIQUE (job_id, hash)
    );
    CREATE TABLE settings (id TEXT PRIMARY KEY, create_date INTEGER, name TEXT, value TEXT, user_id TEXT);
  `);
  priceHistoryMigration(db);

  settings = { baseUrl: '', priceTrackingEnabled: true, priceChangeThresholdPercent: 1 };
  sendPriceChange = vi.fn(() => [Promise.resolve()]);
  send = vi.fn(() => [Promise.resolve()]);

  vi.resetModules();
  vi.doMock('../lib/services/storage/SqliteConnection.js', () => ({
    default: {
      getConnection: () => db,
      query: (sql, params) => db.prepare(sql).all(params),
      execute: (sql, params) => db.prepare(sql).run(params),
      withTransaction: (callback) => db.transaction(() => callback(db))(),
    },
  }));
  vi.doMock('../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
  vi.doMock('../lib/services/storage/settingsStorage.js', () => ({
    getSettings: async () => settings,
    getUserSettings: () => ({ language: 'en' }),
    getAddresses: () => [],
  }));
  vi.doMock('../lib/services/storage/jobStorage.js', () => ({
    getJob: (id) => ({ id, userId: 'user-1', name: 'Berlin', notificationAdapter: [{ id: 'console', fields: {} }] }),
  }));
  vi.doMock('../lib/notification/notify.js', () => ({ send, sendPriceChange }));
  vi.doMock('../lib/services/sse/sse-broker.js', () => ({ sendToUser: vi.fn() }));
  vi.doMock('../lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: vi.fn(async () => null) }));

  storage = await import('../lib/services/storage/listingsStorage.js');
  Pipeline = (await import('../lib/FredyPipelineExecutioner.js')).default;
});

afterEach(() => {
  db.close();
  vi.doUnmock('../lib/services/storage/SqliteConnection.js');
  vi.doUnmock('../lib/services/similarity-check/similarityCache.js');
  vi.doUnmock('../lib/services/storage/settingsStorage.js');
  vi.doUnmock('../lib/services/storage/jobStorage.js');
  vi.doUnmock('../lib/notification/notify.js');
  vi.doUnmock('../lib/services/sse/sse-broker.js');
  vi.doUnmock('../lib/services/geocoding/geoCodingService.js');
});

/**
 * A listing as a provider's `normalize` hands it over: `id` is the hash over advert id and price.
 *
 * @param {string} advert
 * @param {number} price
 * @param {Object} [overrides]
 * @returns {Object}
 */
const scraped = (advert, price, overrides = {}) => ({
  id: `${advert}@${price}`,
  link: `https://www.kleinanzeigen.de/s-anzeige/${advert}`,
  title: `Flat ${advert}`,
  address: '10115 Mitte',
  price,
  size: 60,
  rooms: 2,
  image: null,
  description: 'nice',
  ...overrides,
});

/** Store listings the way the pipeline's save step does, and hand back their row ids. */
const store = (listings, provider = PROVIDER) => {
  const copies = listings.map((listing) => ({ ...listing }));
  storage.storeListings(JOB, provider, copies);
  return copies.map((listing) => listing.id);
};

/** The novelty check of one run, as the pipeline would call it. */
const findNew = async (listings) => {
  const pipeline = new Pipeline({ url: SEARCH_URL }, { id: JOB, notificationAdapter: [] }, PROVIDER, null, null);
  try {
    return await pipeline._findNew(listings);
  } catch (error) {
    if (error?.name === 'NoNewListingsWarning') return [];
    throw error;
  }
};

const rows = () => db.prepare(`SELECT * FROM listings ORDER BY created_at, rowid`).all();
const history = (listingId) =>
  db
    .prepare(`SELECT price, source FROM listing_price_history WHERE listing_id = ? ORDER BY observed_at, rowid`)
    .all(listingId);

describe('why the hash alone cannot tell', () => {
  it('gives the same Kleinanzeigen advert a different hash at a different price, and the same link', async () => {
    const { config } = await import('../lib/provider/kleinanzeigen.js');
    const advert = { id: '3012345678', title: 'Altbau', link: '/s-anzeige/altbau/3012345678-203-3331' };

    const before = config.normalize({ ...advert, price: '1.000 €' });
    const after = config.normalize({ ...advert, price: '900 €' });

    expect(after.id).not.toBe(before.id);
    expect(after.link).toBe(before.link);
  });
});

describe('an advert found again at a different price', () => {
  it('is not new, so it is neither stored twice nor announced as a new listing', async () => {
    store([scraped('a', 1000)]);

    expect(await findNew([scraped('a', 900), scraped('b', 500)])).toEqual([scraped('b', 500)]);
  });

  it('moves the stored row to the new price and the hash it now answers to', async () => {
    const [id] = store([scraped('a', 1000)]);

    await findNew([scraped('a', 900)]);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id, hash: 'a@900', price: 900, previous_price: 1000 });
    expect(history(id)).toEqual([{ price: 900, source: 'scrape' }]);
  });

  it('reports the change through the price change notification', async () => {
    const [id] = store([scraped('a', 1000)]);

    await findNew([scraped('a', 900)]);

    expect(send).not.toHaveBeenCalled();
    expect(sendPriceChange).toHaveBeenCalledTimes(1);
    const [serviceName, changes, , jobKey] = sendPriceChange.mock.calls[0];
    expect(serviceName).toBe(PROVIDER);
    expect(jobKey).toBe(JOB);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id,
      title: 'Flat a',
      link: 'https://www.kleinanzeigen.de/s-anzeige/a',
      oldPrice: '1.000 €',
      newPrice: '900 €',
      direction: 'down',
    });
  });

  it('records the change but sends nothing while price tracking is switched off', async () => {
    settings.priceTrackingEnabled = false;
    const [id] = store([scraped('a', 1000)]);

    expect(await findNew([scraped('a', 900)])).toEqual([]);

    expect(sendPriceChange).not.toHaveBeenCalled();
    expect(rows()[0]).toMatchObject({ id, price: 900 });
  });

  it('keeps a move below the threshold out of the notifications, not out of the row', async () => {
    settings.priceChangeThresholdPercent = 5;
    const [id] = store([scraped('a', 1000)]);

    await findNew([scraped('a', 980)]);

    expect(sendPriceChange).not.toHaveBeenCalled();
    expect(rows()[0]).toMatchObject({ id, price: 980, hash: 'a@980' });
  });

  it('is recognised by its hash on the next run, so the change is reported once', async () => {
    store([scraped('a', 1000)]);
    await findNew([scraped('a', 900)]);

    expect(await findNew([scraped('a', 900)])).toEqual([]);
    expect(sendPriceChange).toHaveBeenCalledTimes(1);
  });

  it('notices the price going back to where it was', async () => {
    const [id] = store([scraped('a', 1000)]);
    await findNew([scraped('a', 900)]);

    await findNew([scraped('a', 1000)]);

    expect(rows()[0]).toMatchObject({ id, hash: 'a@1000', price: 1000, previous_price: 900 });
    expect(sendPriceChange).toHaveBeenCalledTimes(2);
  });

  it('only renames a row whose price the price probe already moved', async () => {
    const [id] = store([scraped('a', 1000)]);
    // The probe reads a detail page: it moves the price and knows no hash.
    db.prepare(`UPDATE listings SET price = 900, previous_price = 1000 WHERE id = ?`).run(id);

    expect(await findNew([scraped('a', 900)])).toEqual([]);

    expect(rows()[0]).toMatchObject({ id, hash: 'a@900', price: 900, previous_price: 1000 });
    expect(history(id)).toEqual([]);
    expect(sendPriceChange).not.toHaveBeenCalled();
  });

  it('still recognises the advert when overlapping result pages list it twice', async () => {
    const [id] = store([scraped('a', 1000)]);

    expect(await findNew([scraped('a', 900), scraped('a', 900)])).toEqual([]);
    expect(rows()[0]).toMatchObject({ id, price: 900 });
    expect(history(id)).toHaveLength(1);
  });

  it('keeps the old hash when another row of the job already holds the new one', async () => {
    const [id] = store([scraped('a', 1000)]);
    // tecnocasa and tecnorete share advert ids, so a sibling provider can hold the very hash.
    store([scraped('a', 900, { link: 'https://www.tecnorete.it/a' })], 'tecnorete');

    expect(await findNew([scraped('a', 900)])).toEqual([]);

    expect(db.prepare(`SELECT hash, price FROM listings WHERE id = ?`).get(id)).toEqual({ hash: 'a@1000', price: 900 });
  });
});

describe('what the link is not trusted for', () => {
  it('leaves a listing the user hid alone, and does not bring it back as new', async () => {
    const [id] = store([scraped('a', 1000)]);
    storage.deleteListingsById([id]);

    expect(await findNew([scraped('a', 900)])).toEqual([]);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ id, hash: 'a@1000', price: 1000, manually_deleted: 1 });
    expect(sendPriceChange).not.toHaveBeenCalled();
  });

  it('stores a repost of an advert the alive check declared gone as a new listing', async () => {
    const [id] = store([scraped('a', 1000)]);
    db.prepare(`UPDATE listings SET is_active = 0 WHERE id = ?`).run(id);

    expect(await findNew([scraped('a', 900)])).toEqual([scraped('a', 900)]);
    expect(rows()[0]).toMatchObject({ id, price: 1000 });
  });

  it('does not match on a link several listings of the same search share', async () => {
    // A project page linking every unit it offers, for instance.
    const project = { link: 'https://example.com/project' };
    store([scraped('unit-1', 300000, project)]);

    const found = [scraped('unit-1', 300000, project), scraped('unit-2', 320000, project)];
    expect(await findNew(found)).toEqual([scraped('unit-2', 320000, project)]);
    expect(rows()[0]).toMatchObject({ price: 300000, hash: 'unit-1@300000' });
  });

  it('does not match on the search page a provider links when an advert has no link of its own', async () => {
    store([scraped('a', 1000, { link: SEARCH_URL })]);

    expect(await findNew([scraped('b', 700, { link: SEARCH_URL })])).toEqual([scraped('b', 700, { link: SEARCH_URL })]);
  });

  it('only looks at the rows of the provider that found the listing', async () => {
    store([scraped('a', 1000)], 'immowelt');

    expect(await findNew([scraped('a', 900)])).toEqual([scraped('a', 900)]);
  });
});
