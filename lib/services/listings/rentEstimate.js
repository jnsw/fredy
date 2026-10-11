/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { DEAL_TYPES } from '../dealType.js';
import { computeBenchmark } from './marketBenchmark.js';

/**
 * What a flat that is for sale would let for, read off the rentals Fredy has found around it.
 *
 * A rental yield needs a rent, and a purchase listing never states one. The usual answer is a
 * Mietspiegel table, which somebody has to source, license and keep current for every town a user
 * might search in, and which is wrong in exactly the places nobody maintains. Fredy already holds a
 * better sample for the places that matter to the user: every rental its rent jobs have found, from
 * the same portals and the same weeks. So the estimate is the market benchmark run once more, over
 * the rentals instead of the purchases.
 *
 * That makes the estimate as good as the rent jobs behind it and no better. A user who only ever
 * searches to buy has no rentals in the table, every estimate comes back empty, and the yield is
 * simply not shown - which is the honest answer, because there is nothing to base one on.
 *
 * Everything in here is pure; the SQL is handed to whichever executor the caller has, exactly as the
 * benchmark does it.
 */

/**
 * The rentals around one listing, with the cold rent in the `price` column, nearest first.
 *
 * The same shape and parameters as {@link import('./marketBenchmark.js').COMPARABLES_SQL}, so the
 * benchmark's radius logic can run over it unchanged. The one thing it adds is the basis of the
 * rent: a yield is computed on the Kaltmiete, and a rent quoted with the running charges in it would
 * overstate it by a fifth or more.
 *
 * - A rent quoted with the charges and the charges stated becomes the rent minus the charges.
 * - A rent quoted with the charges and nothing said about them is left out. Guessing the split
 *   would put an invented figure into a median the user is about to make a purchase decision on.
 * - Everything else counts as stated. German portals quote the Kaltmiete, and a rent whose basis no
 *   portal mentioned (`NULL`) is overwhelmingly one of those.
 *
 * @type {string}
 */
export const RENT_COMPARABLES_SQL = `
  SELECT CASE WHEN l.charges_included = 1 THEN l.price - l.charges ELSE l.price END AS price,
         l.size      AS size,
         l.latitude  AS latitude,
         l.longitude AS longitude
  FROM listings l
         JOIN jobs j ON j.id = l.job_id
  WHERE l.id != @id
    AND j.deal_type = @dealType
    AND l.manually_deleted = 0
    AND l.price > 0
    AND (l.charges_included IS NOT 1 OR l.charges > 0)
    AND l.size >= @minSize
    AND l.latitude BETWEEN @minLat AND @maxLat
    AND l.longitude BETWEEN @minLng AND @maxLng
  ORDER BY (l.latitude - @lat) * (l.latitude - @lat) +
           (l.longitude - @lng) * (l.longitude - @lng) * @lngWeight
  LIMIT @limit
`;

/**
 * The median cold rent per square metre around one listing.
 *
 * Bound by the same rules as the benchmark: the same two radii, and no answer below the same
 * minimum sample. Eight rentals is not much to price a flat on, but it is the bar the price per
 * square metre comparison already holds itself to, and fewer than that would be a guess with a
 * decimal point.
 *
 * @param {{id: string, latitude: number, longitude: number}} listing The purchase being estimated.
 * @param {(sql: string, params: Object) => Array<Object>} runQuery Executor for {@link RENT_COMPARABLES_SQL}.
 * @returns {{medianPricePerSqm: number, sampleSize: number, radiusKm: number}|null} The median cold
 *   rent per square metre and month, how many rentals it came from and how far out they were;
 *   `null` when the listing has no position or too few rentals are nearby.
 */
export function computeRentEstimate(listing, runQuery) {
  return computeBenchmark(listing, DEAL_TYPES.RENT, runQuery, RENT_COMPARABLES_SQL);
}
