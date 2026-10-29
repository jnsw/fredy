/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Telling the SMG API's real answers from its rewritten ones.
 *
 * The search endpoint answers one request with one of two value sets, at random per response: the
 * real listings, or a copy in which every number is rewritten - the price raised by about 27 %, the
 * rooms and the living space changed, the title and description rewritten to match, and
 * `prices.rent.net` and `prices.rent.extra` removed from every row. The same adverts come back in the
 * same order either way, only their values differ. Measured against the host this provider uses,
 * roughly one answer in two to four is the real one, with or without any app headers. Storing a
 * rewritten answer would mean a wrong price, wrong rooms and a wrong size for every listing on it,
 * followed by a "new" listing once the real values turn up.
 *
 * The free text cannot tell the two apart, so the answer is judged against things the rewrite cannot
 * fake:
 *
 * 1. A rent row that keeps `prices.rent.net`. The rewrite strips it from every row, so a single one
 *    proves the answer real.
 * 2. A row that breaks the request's own numeric filters. The search ran on the real values, so a
 *    1-room row on a "from 3 rooms" search proves the answer rewritten.
 * 3. Two different answers to the same request. There are only two value sets, and the rewritten one
 *    is the one with the higher prices.
 *
 * Signals 1 and 2 are those of the CappyT/fredy fork; signal 3 is what makes a purchase search
 * judgeable at all, since a purchase has no net price. An answer none of them can vouch for is not
 * kept: the page is left for the next run, which asks again, rather than risking rewritten values.
 */

/** @type {'honest'} */
export const HONEST = 'honest';
/** @type {'poisoned'} */
export const POISONED = 'poisoned';
/** @type {'unknown'} */
export const UNKNOWN = 'unknown';

/**
 * How many times one page is asked for before it is given up on. The real answer came back between
 * one time in four and one in two in measurements, so ten attempts miss it on a few pages in a
 * hundred at worst - and such a page is only put off to the next run, not lost.
 */
export const MAX_VERIFY_ATTEMPTS = 10;

/**
 * How much higher the prices of one answer must be than another's before it is the rewritten one.
 * The rewrite raises them by 25 to 28 %; the margin keeps a price that merely changed between two
 * requests from deciding anything.
 */
const REWRITE_RATIO = 1.15;

/**
 * How far an area or a price may leave its filter before it counts as breaking it.
 *
 * The search does not apply those filters to exactly the figure the answer shows: a real 79 m² flat
 * comes back on a "from 80 m²" search. The rewrite moves them much further - the living space nearly
 * halved, the price up a quarter - so only a miss of that order is evidence. Rooms come in halves and
 * were never seen outside their filter on a real answer, so they are held to it exactly.
 */
const RELATIVE_SLACK = 0.1;

/** What is left of a room filter's slack: none, beyond the float noise of a half. */
const EPSILON = 1e-6;

/**
 * The numeric filters the search query can carry, and the listing field each one bounds. A field the
 * row does not carry is skipped, so a missing value is never a violation.
 *
 * @type {Array<[string, (listing: any) => unknown]>}
 */
const RANGE_FIELDS = [
  ['numberOfRooms', (listing) => listing?.characteristics?.numberOfRooms],
  ['livingSpace', (listing) => listing?.characteristics?.livingSpace],
  ['lotSize', (listing) => listing?.characteristics?.lotSize],
];

/**
 * @param {any} entry One `results[]` entry of a search answer.
 * @returns {any} The listing it carries.
 */
const listingOf = (entry) => entry?.listing ?? entry;

/**
 * The price a row is compared by: the figure both value sets carry.
 *
 * @param {any} listing
 * @returns {number|null}
 */
function comparablePrice(listing) {
  const value = listing?.prices?.rent?.gross ?? listing?.prices?.rent?.net ?? listing?.prices?.buy?.price;
  const number = Number(value);
  return value != null && Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Whether a value is inside a filter's range, give or take the slack the search itself allows.
 *
 * @param {number} value
 * @param {{from?: number, to?: number}} range
 * @param {string} field The query field the range belongs to.
 * @returns {boolean}
 */
function within(value, range, field) {
  const slack = (bound) => (field === 'numberOfRooms' ? EPSILON : Math.abs(bound) * RELATIVE_SLACK);
  if (range?.from != null && value < range.from - slack(range.from)) return false;
  if (range?.to != null && value > range.to + slack(range.to)) return false;
  return true;
}

/**
 * The first row that breaks a numeric filter of the query, described, or null.
 *
 * The rent filter is not said to bound the net or the gross figure, so a rent row passes when either
 * is inside it.
 *
 * @param {any[]} rows
 * @param {Object} query
 * @returns {string|null}
 */
function findViolation(rows, query) {
  for (const [field, read] of RANGE_FIELDS) {
    const range = query?.[field];
    if (range == null) continue;
    for (const listing of rows) {
      const value = Number(read(listing));
      if (read(listing) != null && Number.isFinite(value) && !within(value, range, field)) {
        return `${field}=${value} on listing ${listing?.id} breaks ${JSON.stringify(range)}`;
      }
    }
  }

  const priceRange = query?.monthlyRent ?? query?.purchasePrice;
  if (priceRange != null) {
    for (const listing of rows) {
      const values = (
        query.purchasePrice != null
          ? [listing?.prices?.buy?.price]
          : [listing?.prices?.rent?.net, listing?.prices?.rent?.gross]
      )
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0);
      if (values.length > 0 && !values.some((value) => within(value, priceRange, 'price'))) {
        return `price=${values.join('/')} on listing ${listing?.id} breaks ${JSON.stringify(priceRange)}`;
      }
    }
  }

  return null;
}

/**
 * Judge one answer on its own.
 *
 * @param {{listings: any[], query: Object}} input The `results` of one answer and the query that
 *   produced it.
 * @returns {{verdict: 'honest'|'poisoned'|'unknown', reason: string}}
 */
export function judgeAnswer({ listings, query }) {
  const rows = (Array.isArray(listings) ? listings : []).map(listingOf).filter((listing) => listing != null);
  if (rows.length === 0) {
    return { verdict: HONEST, reason: 'the page is empty, so nothing on it can be rewritten' };
  }

  const withNet = rows.filter((listing) => listing?.prices?.rent?.net != null).length;
  if (withNet > 0) {
    return { verdict: HONEST, reason: `${withNet} rows keep prices.rent.net` };
  }

  const violation = findViolation(rows, query);
  if (violation != null) {
    return { verdict: POISONED, reason: violation };
  }

  return { verdict: UNKNOWN, reason: 'no row keeps a net rent and none breaks a filter' };
}

/**
 * Which of two answers to the same request is the real one, judged by their prices.
 *
 * @param {any[]} first The `results` of one answer.
 * @param {any[]} second The `results` of another.
 * @returns {'first'|'second'|null} The real one, or null when the prices do not tell - the two are
 *   the same value set, or their prices do not differ by what the rewrite adds.
 */
export function cheaperOf(first, second) {
  const prices = new Map();
  for (const listing of (first ?? []).map(listingOf)) {
    const price = comparablePrice(listing);
    if (listing?.id != null && price != null) prices.set(String(listing.id), price);
  }

  const ratios = [];
  for (const listing of (second ?? []).map(listingOf)) {
    const before = prices.get(String(listing?.id));
    const after = comparablePrice(listing);
    if (before != null && after != null && before !== after) ratios.push(after / before);
  }
  if (ratios.length === 0) return null;

  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  if (median >= REWRITE_RATIO) return 'first';
  if (median <= 1 / REWRITE_RATIO) return 'second';
  return null;
}

/**
 * Ask for one page until an answer can be vouched for, or the attempts run out.
 *
 * The same body is sent every time; only the endpoint's choice of value set changes between two
 * identical requests.
 *
 * @param {Object} input
 * @param {(body: Object) => Promise<{results: any[]}|null>} input.requestPage Asks for the page.
 * @param {Object} input.body The request body, sent unchanged on every attempt.
 * @returns {Promise<{answer: any|null, verdict: {verdict: string, reason: string}|null, attempts: number}>}
 *   The answer to keep with its verdict, which is `honest` exactly when it may be kept. `answer` is
 *   null when the endpoint stopped answering.
 */
export async function readVerifiedPage({ requestPage, body }) {
  /** @type {Array<{answer: any, verdict: {verdict: string, reason: string}}>} */
  const seen = [];

  for (let attempts = 1; attempts <= MAX_VERIFY_ATTEMPTS; attempts++) {
    const answer = await requestPage(body);
    if (answer == null) return { answer: null, verdict: null, attempts };

    const verdict = judgeAnswer({ listings: answer.results, query: body.query });
    if (verdict.verdict === HONEST) return { answer, verdict, attempts };

    // An answer that differs from an earlier one settles both: the cheaper of the two is real. One
    // that already broke a filter cannot be the real one, whatever its prices say.
    for (const earlier of seen) {
      const cheaper = cheaperOf(earlier.answer.results, answer.results);
      const real = cheaper === 'first' ? earlier : cheaper === 'second' ? { answer, verdict } : null;
      if (real != null && real.verdict.verdict !== POISONED) {
        return {
          answer: real.answer,
          verdict: { verdict: HONEST, reason: 'the cheaper of the two value sets the endpoint answered' },
          attempts,
        };
      }
    }
    seen.push({ answer, verdict });
  }

  const last = seen[seen.length - 1];
  const reason = seen.every((entry) => entry.verdict.verdict === POISONED)
    ? last.verdict.reason
    : `${MAX_VERIFY_ATTEMPTS} answers that could not be told apart`;
  return { answer: last.answer, verdict: { verdict: POISONED, reason }, attempts: MAX_VERIFY_ATTEMPTS };
}
