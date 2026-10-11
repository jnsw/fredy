/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up as addRentEstimate } from '../../lib/services/storage/migrations/sql/57.listing-rent-estimate.js';
import { up as addColdRentOverride } from '../../lib/services/storage/migrations/sql/58.listing-cold-rent-override.js';
import { MIN_SAMPLE } from '../../lib/services/listings/marketBenchmark.js';

/** Cologne cathedral. */
const LAT = 50.9413;
const LNG = 6.958;

/**
 * The listings table as migration 46 leaves it, minus what neither migration here reads.
 *
 * @param {Database.Database} db
 */
function createSchema(db) {
  db.exec(`
    CREATE TABLE jobs (id TEXT PRIMARY KEY, deal_type TEXT);
    CREATE TABLE listings (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      price REAL,
      size REAL,
      charges_included INTEGER,
      charges REAL,
      latitude REAL,
      longitude REAL,
      manually_deleted INTEGER DEFAULT 0
    );
    INSERT INTO jobs (id, deal_type) VALUES ('rent-job', 'rent'), ('buy-job', 'buy');
  `);
}

const columns = (db) =>
  db
    .prepare(`PRAGMA table_info(listings)`)
    .all()
    .map((column) => column.name);

describe('migration 57 - listing rent estimate', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
  });

  afterEach(() => db.close());

  const add = (id, { jobId = 'rent-job', price = 500, size = 50, km = 1, lat = LAT } = {}) =>
    db
      .prepare(`INSERT INTO listings (id, job_id, price, size, latitude, longitude) VALUES (?,?,?,?,?,?)`)
      .run(id, jobId, price, size, lat == null ? null : lat + km / 111.32, lat == null ? null : LNG);

  it('adds the estimate, its sample size and its radius', () => {
    addRentEstimate(db);
    expect(columns(db)).toEqual(expect.arrayContaining(['rent_median_sqm', 'rent_sample_size', 'rent_radius_km']));
  });

  // The purchases already stored get the estimate they would have had, had the feature existed
  // when they were found.
  it('backfills the purchases already stored from the rentals around them', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      add(`rental-${index}`);
    }
    add('purchase', { jobId: 'buy-job', price: 250000, size: 60, km: 0 });

    addRentEstimate(db);

    expect(db.prepare(`SELECT rent_median_sqm, rent_sample_size FROM listings WHERE id = 'purchase'`).get()).toEqual({
      rent_median_sqm: 10,
      rent_sample_size: MIN_SAMPLE,
    });
  });

  // A rental has a rent already; estimating one for it would be a second, worse answer.
  it('estimates nothing for rentals, nor for a purchase it cannot place', () => {
    for (let index = 0; index < MIN_SAMPLE; index += 1) {
      add(`rental-${index}`);
    }
    add('unplaced', { jobId: 'buy-job', price: 250000, size: 60, lat: null });

    addRentEstimate(db);

    const estimated = db.prepare(`SELECT id FROM listings WHERE rent_median_sqm IS NOT NULL`).all();
    expect(estimated).toEqual([]);
  });

  it('is a no-op when run again', () => {
    addRentEstimate(db);
    expect(() => addRentEstimate(db)).not.toThrow();
  });
});

describe('migration 58 - cold rent override', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
  });

  afterEach(() => db.close());

  // NULL means "use the estimate", which is what every listing had before.
  it('adds the column and leaves every stored listing on the estimate', () => {
    db.prepare(`INSERT INTO listings (id, job_id, price) VALUES ('old', 'buy-job', 250000)`).run();

    addColdRentOverride(db);

    expect(columns(db)).toContain('cold_rent_override');
    expect(db.prepare(`SELECT cold_rent_override FROM listings WHERE id = 'old'`).get().cold_rent_override).toBeNull();
  });

  it('is a no-op when run again', () => {
    addColdRentOverride(db);
    expect(() => addColdRentOverride(db)).not.toThrow();
  });
});
