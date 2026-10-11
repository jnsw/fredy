/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Parse a number written in either English style (comma groups thousands: "425,000") or
 * French/Dutch/German style (period groups thousands: "425.000"), including a fraction in either
 * ("97,5", "97.5").
 *
 * `extractNumber` from `extract-number.js` cannot do this: it reads a lone comma as the
 * decimal separator, which is right for every German portal and turns an English "425,000" into
 * 425. A portal serving the same page in English, French and Dutch - Immoweb - writes its figures
 * in whichever of those the visitor picked, so the separator has to be decided from the number
 * itself.
 *
 * The rule: everything but digits and separators is dropped, and the last separator is a decimal
 * point only when one or two digits follow it. Otherwise every separator groups thousands. The cost
 * is that an English "1,5" or a German "1.50" reads as a fraction, which is what both mean.
 *
 * @param {string|number|null|undefined} raw
 * @returns {number|null} The number, or null when there is none to read.
 */
export function parseLocaleNumber(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const cleaned = String(raw).replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const decimalMatch = cleaned.match(/[.,](\d{1,2})$/);
  if (decimalMatch) {
    const decimals = decimalMatch[1];
    const integerPart = cleaned.slice(0, cleaned.length - decimals.length - 1).replace(/[.,]/g, '');
    const value = Number.parseFloat(`${integerPart || '0'}.${decimals}`);
    return Number.isFinite(value) ? value : null;
  }

  const value = Number.parseInt(cleaned.replace(/[.,]/g, ''), 10);
  return Number.isFinite(value) ? value : null;
}
