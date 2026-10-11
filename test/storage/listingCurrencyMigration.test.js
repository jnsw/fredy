/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/51.listing-currency.js';

/**
 * Every price used to be taken for euros. The column says which currency it is in, and the rows
 * stored before it existed get what they were taken to be - except the two portals whose prices
 * were never euros.
 */
describe('migration 51 - listing currency', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE listings (id TEXT PRIMARY KEY, provider TEXT, link TEXT, price REAL)`);
  });

  afterEach(() => db.close());

  const insert = (id, provider, link) =>
    db.prepare(`INSERT INTO listings (id, provider, link, price) VALUES (?, ?, ?, 1000)`).run(id, provider, link);
  const currencyOf = (id) => db.prepare(`SELECT currency FROM listings WHERE id = ?`).get(id).currency;

  it('labels every existing listing as euros', () => {
    insert('is24', 'immoscout', 'https://www.immobilienscout24.de/expose/1');
    insert('nolink', 'kleinanzeigen', null);
    up(db);

    expect(currencyOf('is24')).toBe('EUR');
    expect(currencyOf('nolink')).toBe('EUR');
  });

  it("labels Flatfox's Swiss rents as francs, which they always were", () => {
    insert('ff', 'flatfox', 'https://flatfox.ch/de/wohnung/8001-zuerich/123/');
    up(db);
    expect(currencyOf('ff')).toBe('CHF');
  });

  // One application on three domains: the stored link says which site an advert is on.
  it('labels only the Swiss BETTERHOMES site as francs', () => {
    insert('bh-ch', 'betterhomes', 'https://www.betterhomes.ch/de/immobilie-suchen/detail/objectId/a');
    insert('bh-de', 'betterhomes', 'https://www.betterhomes.de/de/immobilie-suchen/detail/objectId/b');
    insert('bh-at', 'betterhomes', 'https://www.betterhomes.at/de/immobilie-suchen/detail/objectId/c');
    up(db);

    expect(currencyOf('bh-ch')).toBe('CHF');
    expect(currencyOf('bh-de')).toBe('EUR');
    expect(currencyOf('bh-at')).toBe('EUR');
  });

  it('gives a listing inserted afterwards euros unless it says otherwise', () => {
    up(db);
    db.prepare(`INSERT INTO listings (id, provider, link, price) VALUES ('new', 'immowelt', null, 1)`).run();
    expect(currencyOf('new')).toBe('EUR');
    expect(() => db.prepare(`UPDATE listings SET currency = NULL WHERE id = 'new'`).run()).toThrow();
  });

  it('is a no-op when run again', () => {
    insert('ff', 'flatfox', 'https://flatfox.ch/1');
    up(db);
    db.prepare(`UPDATE listings SET currency = 'EUR' WHERE id = 'ff'`).run();
    expect(() => up(db)).not.toThrow();
    // A second run must not relabel rows the first one already settled.
    expect(currencyOf('ff')).toBe('EUR');
  });
});
