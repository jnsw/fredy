/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * @typedef {Object} SpecFilter
 * @property {number} [minRooms] Minimum number of rooms.
 * @property {number} [minSize] Minimum size in m².
 * @property {number} [maxPrice] Maximum price.
 * @property {string|null} [moveInEarliest] Earliest acceptable move-in date, `YYYY-MM-DD`. Compared
 *   with the date the portal states; see `lib/utils/moveInDate.js`.
 * @property {string|null} [moveInLatest] Latest acceptable move-in date, `YYYY-MM-DD`.
 * @property {boolean|null} [moveInDateRequired] Also leave out listings that state no move-in date.
 *   Off by default, because most portals never state one, and only meaningful with a date above.
 * @property {number} [minGrossYield] Minimum estimated gross rental yield in percent. Purchase jobs
 *   only; a rent job ignores it. Applied after the geocode rather than with the price, size and rooms
 *   filters, because the rent it is computed from is estimated from the rentals around the listing -
 *   see `lib/services/finance/rentalYield.js`. A listing without an estimate is kept.
 */

/**
 * @typedef {Object} SpatialFilter GeoJSON FeatureCollection.
 * @property {Array<Object>} [features] GeoJSON features for spatial filtering (typically Polygons).
 * @property {string} [type] Type 'FeatureCollection'.
 */

/*
 * The commute filter lives in `lib/utils/commuteBudget.js` rather than here, next to the code that
 * normalises and applies it: it is the one filter with behaviour attached, not just a shape.
 */

export {};
