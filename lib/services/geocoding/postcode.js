/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { DEFAULT_COUNTRIES } from '../providers/countries.js';

/** Countries in scope whose postcodes have four digits rather than five. */
const FOUR_DIGIT_POSTCODE_COUNTRIES = new Set(['at', 'ch']);

/**
 * The postcode an address names, read the way the countries in scope write one.
 *
 * Germany, France, Italy and Spain use five digits, Austria and Switzerland four, so the length that
 * counts depends on where the search is. Within that, a number only counts where a postcode stands:
 * at the start, after a comma, or after a house number and before a locality. That keeps the house
 * number of `Musterstraße 1030, 10117 Berlin` from being read as an Austrian postcode when a job
 * spans both countries, and a lone house number in `Musterstraße 1030 Wien` from being read as one
 * at all.
 *
 * @param {unknown} address
 * @param {readonly string[]} [countries] - ISO 3166-1 alpha-2 codes. Defaults to Germany.
 * @returns {string|null} The postcode, or null when the address does not clearly name one.
 */
export function extractPostcode(address, countries = DEFAULT_COUNTRIES) {
  if (address == null) return null;
  const codes = Array.isArray(countries) && countries.length > 0 ? countries : DEFAULT_COUNTRIES;
  const lengths = new Set(codes.map((country) => (FOUR_DIGIT_POSTCODE_COUNTRIES.has(country.toLowerCase()) ? 4 : 5)));
  const text = String(address);
  const candidates = [...text.matchAll(/\b\d{4,5}\b/g)].filter((match) => lengths.has(match[0].length));

  const positioned = candidates.filter((match) => {
    const prefix = text.slice(0, match.index);
    return prefix.trim() === '' || prefix.trimEnd().endsWith(',');
  });
  const afterHouseNumber = candidates.filter((match) => {
    const prefix = text.slice(0, match.index);
    const suffix = text.slice(match.index + match[0].length);
    return /\b\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+$/iu.test(prefix) && /^\s+\p{L}/u.test(suffix);
  });

  return positioned.at(-1)?.[0] ?? afterHouseNumber.at(-1)?.[0] ?? null;
}
