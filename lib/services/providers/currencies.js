/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Currency codes, with nothing behind them.
 *
 * A price is a bare number everywhere in Fredy, and for most providers that number is euros. Not for
 * all of them: Flatfox is Swiss and its rents are francs. Nothing converts one into the other - an
 * exchange rate would need a service to ask and would be stale on the row the day after - so a
 * listing keeps the currency it was advertised in, every place that prints a price prints that
 * currency, and every place that compares prices compares only prices in the same one.
 *
 * Where the code comes from, most specific first:
 *
 * 1. `listing.currency`, set by a provider's `normalize()` (or `fetchDetails()`) for a portal that
 *    serves several currencies and can tell them apart per advert - BETTERHOMES runs one
 *    application on `.de`, `.at` and `.ch`.
 * 2. `metaInformation.currency`, the provider's own declaration - `'CHF'` on Flatfox.
 * 3. {@link DEFAULT_CURRENCY}, which is what every provider that declares nothing lists in.
 *
 * Deliberately free of imports, like `countries.js`: the notification formatter and the storage
 * layer read this, and must not load the provider modules to do so.
 */

/**
 * The currency of a price nothing says otherwise about.
 *
 * Also what every listing stored before currencies existed was labelled with by migration 51, since
 * that is what Fredy took every price to be until then.
 *
 * @type {string}
 */
export const DEFAULT_CURRENCY = 'EUR';

/** ISO 4217 alphabetic code, upper case. */
const ISO_4217 = /^[A-Z]{3}$/;

/**
 * Read a declared currency, or `null` when it is not one.
 *
 * @param {unknown} raw Whatever a provider or a row put there.
 * @returns {string|null} The upper-cased three-letter code.
 */
function parseCurrency(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const code = raw.trim().toUpperCase();
  return ISO_4217.test(code) ? code : null;
}

/**
 * Read a currency leniently, the way `countries` is read: anything that is not a three-letter code
 * falls back to the default rather than stopping a contributed provider from loading.
 * `test/provider/providerMetaInformation.test.js` is what keeps a typo in a shipped provider from
 * hiding behind that leniency.
 *
 * @param {unknown} raw A `metaInformation.currency`, a stored `currency` column, a request value.
 * @returns {string} Upper-case ISO 4217 code.
 */
export function normalizeCurrency(raw) {
  return parseCurrency(raw) ?? DEFAULT_CURRENCY;
}

/**
 * Whether a price is in the default currency.
 *
 * The finance model lends, taxes and budgets in euros (it is a German one), so it is the question
 * every caller of it has to ask before scoring a price.
 *
 * @param {unknown} raw A stored `currency` column; a missing one is the default.
 * @returns {boolean}
 */
export function isDefaultCurrency(raw) {
  return normalizeCurrency(raw) === DEFAULT_CURRENCY;
}

/**
 * The currency one listing's price is in.
 *
 * The listing's own code wins when it carries a valid one, because only the provider's `normalize()`
 * can know which of several sites an advert came from. A malformed one is ignored rather than
 * trusted, and the provider's declaration answers instead.
 *
 * @param {{currency?: unknown}|null|undefined} meta The provider's `metaInformation`.
 * @param {{currency?: unknown}|null|undefined} listing The listing being stored.
 * @returns {string} Upper-case ISO 4217 code.
 */
export function currencyForListing(meta, listing) {
  return parseCurrency(listing?.currency) ?? normalizeCurrency(meta?.currency);
}
