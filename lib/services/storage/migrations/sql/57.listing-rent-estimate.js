/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { MIN_SIZE_SQM } from '../../../listings/marketBenchmark.js';
import { RENT_COMPARABLES_SQL, computeRentEstimate } from '../../../listings/rentEstimate.js';

/**
 * What a purchase would let for, estimated from the rentals around it.
 *
 * Three columns on the purchase listings, written once when the listing arrives, for the same reason
 * the market benchmark is written down rather than computed on read: the median is a second pass over
 * the table per row, and the listings page cannot afford one per card. The rental yield on the detail
 * page and the job's minimum yield are both plain arithmetic on top of them.
 *
 * - `rent_median_sqm`: the median cold rent per square metre and month of the rentals nearby.
 * - `rent_sample_size`: how many rentals that was.
 * - `rent_radius_km`: how far out they were.
 *
 * All three stay NULL wherever there are too few rentals nearby, which on an instance without rent
 * jobs is everywhere. Nothing is estimated for rentals themselves: they have a rent already.
 *
 * The backfill gives the purchases already stored the estimate they would have had, had the feature
 * existed when they were found. It is bounded like the benchmark's: one query per located purchase,
 * at most 300 rows each.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('rent_median_sqm')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_median_sqm REAL`);
  }
  if (missing('rent_sample_size')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_sample_size INTEGER`);
  }
  if (missing('rent_radius_km')) {
    db.exec(`ALTER TABLE listings ADD COLUMN rent_radius_km REAL`);
  }

  const purchases = db
    .prepare(
      `SELECT l.id AS id, l.latitude AS latitude, l.longitude AS longitude
       FROM listings l
              JOIN jobs j ON j.id = l.job_id
       WHERE j.deal_type = 'buy'
         AND l.manually_deleted = 0
         AND l.size >= ${MIN_SIZE_SQM}
         AND l.latitude IS NOT NULL
         AND l.longitude IS NOT NULL
         AND l.rent_median_sqm IS NULL`,
    )
    .all();

  if (purchases.length === 0) {
    return;
  }

  const comparables = db.prepare(RENT_COMPARABLES_SQL);
  const runQuery = (_sql, params) => comparables.all(params);
  const write = db.prepare(
    `UPDATE listings
     SET rent_median_sqm  = @median,
         rent_sample_size = @sampleSize,
         rent_radius_km   = @radiusKm
     WHERE id = @id`,
  );

  for (const listing of purchases) {
    const estimate = computeRentEstimate(listing, runQuery);
    if (estimate == null) {
      continue;
    }
    write.run({
      id: listing.id,
      median: estimate.medianPricePerSqm,
      sampleSize: estimate.sampleSize,
      radiusKm: estimate.radiusKm,
    });
  }
}
