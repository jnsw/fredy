/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Used when no locale is passed. Components have one from `useLocale()`; the map popup builds plain
 * markup outside React and gets it handed down from the view.
 * @type {string}
 */
const DEFAULT_LOCALE = 'de-DE';

/**
 * What a price is in when nothing says otherwise.
 *
 * Every listing carries its own `currency` (ISO 4217), set by the server from the provider that
 * found it, so this only answers for a row that does not - a listing from before currencies
 * existed, a fixture, the onboarding tour. Duplicated from `lib/services/providers/currencies.js`
 * like the rest of the code the browser cannot import out of `lib/`, together with
 * {@link normalizeCurrency}; `test/ui/currencyCopyInSync.test.js` fails if the copies drift apart.
 * @type {string}
 */
export const DEFAULT_CURRENCY = 'EUR';

/** ISO 4217 alphabetic code. */
const ISO_4217 = /^[A-Z]{3}$/;

/**
 * Read a currency code leniently: anything that is not one reads as the default rather than
 * making `Intl.NumberFormat` throw in the middle of a render.
 *
 * @param {unknown} currency
 * @returns {string} Upper-case ISO 4217 code.
 */
export function normalizeCurrency(currency) {
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  return ISO_4217.test(code) ? code : DEFAULT_CURRENCY;
}

/**
 * The currencies a set of providers price in, from their `metaInformation`.
 *
 * For the places that have providers rather than listings in hand - the job form, whose price
 * ceiling is compared against each listing in the currency its portal quotes.
 *
 * @param {Iterable<string>} providerIds
 * @param {Array<{id: string, currency?: string}>|null|undefined} providers The `provider` store slice.
 * @returns {string[]} Sorted codes, the default alone when nothing resolves.
 */
export function currenciesOfProviders(providerIds, providers) {
  const byId = new Map((providers ?? []).map((provider) => [provider?.id, provider]));
  const codes = new Set();
  for (const id of providerIds ?? []) {
    if (!byId.has(id)) continue;
    codes.add(normalizeCurrency(byId.get(id)?.currency));
  }
  return codes.size === 0 ? [DEFAULT_CURRENCY] : [...codes].sort();
}

/**
 * `Intl.NumberFormat` is expensive to construct and a listings grid formats one price per card, so
 * formatters are built once per locale, precision and currency and then reused.
 * @type {Map<string, Intl.NumberFormat>}
 */
const formatterCache = new Map();

/**
 * @param {string} locale BCP 47 locale.
 * @param {number} fractionDigits Exact number of decimals to print.
 * @param {string} currency ISO 4217 code, already normalised.
 * @returns {Intl.NumberFormat}
 */
function priceFormatter(locale, fractionDigits, currency) {
  const key = `${locale}:${fractionDigits}:${currency}`;
  let formatter = formatterCache.get(key);
  if (formatter == null) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * A price the way the reader's language writes one, grouping and currency symbol included:
 * `776.515 €` in German, `€776,515` in English, `2.710 CHF` for a Swiss rent.
 *
 * Cents appear only when the price actually has them. Asking prices come in whole units and a
 * permanent `,00` behind six figures is noise, while a price that does carry cents still prints
 * both digits rather than the single one a plain `maximumFractionDigits` would leave.
 *
 * A value that is not a number is handed back as it came, with a bare symbol appended: it is
 * usually a provider writing "auf Anfrage" into the price field, and mangling that into `NaN €`
 * helps nobody.
 *
 * @param {number|string} price
 * @param {string} [locale='de-DE'] BCP 47 locale, from `useLocale()` inside components.
 * @param {number|null} [fractionDigits=null] Forces an exact number of decimals instead of the rule
 *   above. Asking prices are read one at a time and are better off without a permanent `,00`, but a
 *   price per square metre is read down a column against its neighbours, and `13 €` beside
 *   `21,76 €` reads as a different kind of number rather than a rounder one.
 * @param {string|null} [currency='EUR'] ISO 4217 code the price is in - the listing's own `currency`.
 * @returns {string}
 */
export const formatPrice = (price, locale = DEFAULT_LOCALE, fractionDigits = null, currency = DEFAULT_CURRENCY) => {
  const code = normalizeCurrency(currency);
  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice)) {
    return `${price} ${code === DEFAULT_CURRENCY ? '€' : code}`;
  }

  const digits = fractionDigits ?? (Number.isInteger(parsedPrice) ? 0 : 2);
  return priceFormatter(locale || DEFAULT_LOCALE, digits, code).format(parsedPrice);
};

/**
 * A price bound that applies in several currencies at once, such as a job's price ceiling.
 *
 * Nothing converts between currencies, so a job's "at most 1500" is held against each listing in
 * the currency its portal quotes. With one currency that is an ordinary price; with several it is
 * the number followed by every code it applies in (`1.500 CHF / EUR`), so the reader is told
 * rather than left to assume one of them.
 *
 * @param {number|string} price
 * @param {string} [locale='de-DE']
 * @param {string[]} [currencies] ISO 4217 codes, as {@link currenciesOfProviders} returns them.
 * @returns {string}
 */
export function formatPriceInCurrencies(price, locale = DEFAULT_LOCALE, currencies = [DEFAULT_CURRENCY]) {
  const codes = [...new Set((currencies ?? []).map(normalizeCurrency))];
  if (codes.length <= 1) {
    return formatPrice(price, locale, null, codes[0] ?? DEFAULT_CURRENCY);
  }
  const parsedPrice = Number(price);
  const amount = Number.isFinite(parsedPrice)
    ? new Intl.NumberFormat(locale || DEFAULT_LOCALE, { maximumFractionDigits: 2 }).format(parsedPrice)
    : String(price);
  return `${amount} ${codes.join(' / ')}`;
}

/**
 * {@link formatPrice} in euros, for the places that are euros by construction: the finance tools,
 * whose model and every figure in it are German.
 *
 * @param {number|string} price
 * @param {string} [locale='de-DE']
 * @param {number|null} [fractionDigits=null]
 * @returns {string}
 */
export const formatEuroPrice = (price, locale = DEFAULT_LOCALE, fractionDigits = null) =>
  formatPrice(price, locale, fractionDigits, DEFAULT_CURRENCY);
