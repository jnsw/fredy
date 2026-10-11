/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

/**
 * The map's listings, filtered the way the overview is.
 *
 * Backed by a real in-memory database, like the bulk delete next to it: the promise is that the
 * map shows the located part of exactly what the overview lists for the same filters, and the only
 * honest way to check that is to ask both and compare.
 */
let db;

vi.mock('../../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    query: (sql, params = {}) => db.prepare(sql).all(params),
    withTransaction: (callback) => db.transaction((cb) => cb(db))(callback),
  },
}));

/** Somewhere in Berlin, for every listing that has a place on a map. */
const BERLIN = { latitude: 52.52, longitude: 13.4 };

/**
 * @param {string} id
 * @param {Object} [overrides]
 */
function addListing(id, overrides = {}) {
  const row = {
    id,
    job_id: 'alice-job',
    provider: 'immoscout',
    title: `Flat ${id}`,
    address: 'Somewhere 1',
    price: 1000,
    size: 60,
    rooms: 2,
    status: null,
    is_active: 1,
    manually_deleted: 0,
    created_at: 1000,
    connectivity_max_down: null,
    ...BERLIN,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO listings (id, job_id, provider, title, address, price, size, rooms, status, is_active,
                           manually_deleted, created_at, latitude, longitude, connectivity_max_down)
     VALUES (@id, @job_id, @provider, @title, @address, @price, @size, @rooms, @status, @is_active,
             @manually_deleted, @created_at, @latitude, @longitude, @connectivity_max_down)`,
  ).run(row);
}

describe('listingsStorage.getListingsForMap', () => {
  let storage;

  /** @param {Object} filters */
  const onMap = (filters) =>
    storage
      .getListingsForMap(filters)
      .listings.map((row) => row.id)
      .sort();

  /** @param {Object} filters */
  const listed = (filters) =>
    storage
      .queryListings({ ...filters, pageSize: 100 })
      .result.map((row) => row.id)
      .sort();

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE listings (
        id                    TEXT PRIMARY KEY,
        job_id                TEXT,
        provider              TEXT,
        title                 TEXT,
        address               TEXT,
        price                 REAL,
        size                  REAL,
        rooms                 REAL,
        link                  TEXT,
        image_url             TEXT,
        status                JSON,
        distances             JSONB,
        latitude              REAL,
        longitude             REAL,
        created_at            INTEGER,
        published_at          INTEGER,
        is_active             INTEGER,
        manually_deleted      INTEGER DEFAULT 0,
        connectivity          JSON,
        connectivity_max_down INTEGER,
        connectivity_fiber    INTEGER,
        connectivity_mobile   INTEGER,
        connectivity_at       INTEGER
      );
      CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT, deal_type TEXT, user_id TEXT, shared_with_user JSON);
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (
        id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, filename TEXT, mime_type TEXT,
        size INTEGER, content BLOB, created_at INTEGER
      );
      CREATE TABLE listing_travel_times (
        listing_id TEXT, label TEXT, transit_minutes INTEGER, car_minutes INTEGER,
        bike_minutes INTEGER, walk_minutes INTEGER, is_estimate INTEGER, transit_geometry TEXT,
        car_geometry TEXT, bike_geometry TEXT, walk_geometry TEXT
      );
      INSERT INTO jobs (id, name, deal_type, user_id, shared_with_user)
      VALUES ('alice-job', 'Alice Job', 'rent', 'alice', '[]'),
             ('bob-job', 'Bob Job', 'rent', 'bob', '[]');
    `);
    storage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  it('shows the located part of exactly what the overview lists for the same filters', () => {
    addListing('match');
    addListing('match-unlocated', { latitude: null, longitude: null });
    addListing('match-not-found', { latitude: -1, longitude: -1 });
    addListing('other-provider', { provider: 'immowelt' });
    addListing('inactive', { is_active: 0 });
    addListing('applied', { status: JSON.stringify({ status: 'applied', setAt: 1 }) });
    addListing('fast', { connectivity_max_down: 1000 });
    db.prepare(`INSERT INTO watch_list (id, listing_id, user_id) VALUES ('w1', 'match', 'alice')`).run();
    db.prepare(
      `INSERT INTO listing_travel_times (listing_id, label, transit_minutes) VALUES ('match', 'Work', 20)`,
    ).run();

    const cases = [
      { userId: 'alice', providerFilter: 'immoscout', activityFilter: true },
      { userId: 'alice', activityFilter: false },
      { userId: 'alice', statusFilter: 'applied' },
      { userId: 'alice', watchListFilter: true },
      { userId: 'alice', connectivityMinDown: 500 },
      { userId: 'alice', travelTimeFilter: { mode: 'transit', maxMinutes: 30 } },
    ];
    for (const filters of cases) {
      const located = listed(filters).filter((id) => !id.startsWith('match-'));
      expect(onMap(filters), JSON.stringify(filters)).toEqual(located);
    }
    expect(onMap({ userId: 'alice', watchListFilter: true })).toEqual(['match']);
    expect(onMap({ userId: 'alice', travelTimeFilter: { mode: 'transit', maxMinutes: 30 } })).toEqual(['match']);
  });

  it('never returns a listing it could not place, whatever the filter', () => {
    addListing('placed');
    addListing('unlocated', { latitude: null, longitude: null });
    addListing('not-found', { latitude: -1, longitude: -1 });

    expect(onMap({ userId: 'alice' })).toEqual(['placed']);
  });

  it('shows inactive listings when asked, rather than always hiding them', () => {
    addListing('active');
    addListing('inactive', { is_active: 0 });

    expect(onMap({ userId: 'alice', activityFilter: true })).toEqual(['active']);
    expect(onMap({ userId: 'alice', activityFilter: false })).toEqual(['inactive']);
    expect(onMap({ userId: 'alice' })).toEqual(['active', 'inactive']);
  });

  it('keeps hidden listings off unless the hidden view asks for them', () => {
    addListing('visible');
    addListing('hidden', { manually_deleted: 1 });

    expect(onMap({ userId: 'alice' })).toEqual(['visible']);
    expect(onMap({ userId: 'alice', hiddenOnly: true })).toEqual(['hidden']);
  });

  it('never reaches another user’s listings, and lets an admin see all of them', () => {
    addListing('mine');
    addListing('not-mine', { job_id: 'bob-job' });

    expect(onMap({ userId: 'alice' })).toEqual(['mine']);
    expect(onMap({ userId: 'root', isAdmin: true })).toEqual(['mine', 'not-mine']);
    expect(onMap({ userId: 'alice', jobIdFilter: 'bob-job' })).toEqual([]);
  });

  it('carries the travel times a pin and its popup show', () => {
    addListing('commute');
    db.prepare(
      `INSERT INTO listing_travel_times (listing_id, label, transit_minutes) VALUES ('commute', 'Work', 25)`,
    ).run();

    const [listing] = storage.getListingsForMap({ userId: 'alice' }).listings;

    expect(listing.job_name).toBe('Alice Job');
    expect(listing.travelTimes?.[0]?.label).toBe('Work');
  });
});
