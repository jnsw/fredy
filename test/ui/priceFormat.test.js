/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CURRENCY,
  currenciesOfProviders,
  formatEuroPrice,
  formatPrice,
  formatPriceInCurrencies,
  normalizeCurrency,
} from '../../ui/src/services/price/priceService.js';
import {
  formatCompactPrice,
  formatEuro,
  formatEuroCompact,
  formatWholePrice,
} from '../../ui/src/components/cards/chartTheme.js';

/**
 * `Intl` separates the amount from the currency symbol with a narrow no-break space, which is
 * invisible in a diff and would make every assertion here a guessing game.
 * @param {string} value
 * @returns {string}
 */
const normalize = (value) => value.replace(/[\u00a0\u202f]/g, ' ');

describe('formatEuroPrice', () => {
  it('groups thousands and appends the symbol, German style', () => {
    expect(normalize(formatEuroPrice(776515, 'de-DE'))).toBe('776.515 €');
  });

  it('follows the reader locale for separator and symbol position', () => {
    expect(normalize(formatEuroPrice(776515, 'en-US'))).toBe('€776,515');
  });

  it('drops the cents a whole price does not have', () => {
    expect(normalize(formatEuroPrice(1016, 'de-DE'))).toBe('1.016 €');
  });

  it('prints both digits when a price does carry cents', () => {
    expect(normalize(formatEuroPrice(1016.5, 'de-DE'))).toBe('1.016,50 €');
    expect(normalize(formatEuroPrice(1016.55, 'de-DE'))).toBe('1.016,55 €');
  });

  it('accepts the numeric strings the storage layer hands back', () => {
    expect(normalize(formatEuroPrice('776515', 'de-DE'))).toBe('776.515 €');
  });

  it('formats in German when no locale is given', () => {
    expect(normalize(formatEuroPrice(776515))).toBe('776.515 €');
  });

  it('falls back to German rather than throwing on an empty locale', () => {
    expect(normalize(formatEuroPrice(776515, ''))).toBe('776.515 €');
  });

  it('hands back text prices unchanged, as providers wrote them', () => {
    expect(formatEuroPrice('auf Anfrage', 'de-DE')).toBe('auf Anfrage €');
  });

  it('formats zero rather than treating it as missing', () => {
    expect(normalize(formatEuroPrice(0, 'de-DE'))).toBe('0 €');
  });

  it('reuses one formatter per locale and precision', () => {
    // Same output on the second call is the only observable proof the cache did not go stale.
    expect(formatEuroPrice(1234, 'de-DE')).toBe(formatEuroPrice(1234, 'de-DE'));
    expect(normalize(formatEuroPrice(1234, 'en-US'))).toBe('€1,234');
  });
});

describe('formatEuro (charts)', () => {
  it('shares the listing format so a chart and a card read alike', () => {
    expect(normalize(formatEuro(776515, 'de-DE'))).toBe(normalize(formatEuroPrice(776515, 'de-DE')));
  });

  it('rounds away the cents an axis label has no room for', () => {
    expect(normalize(formatEuro(1016.55, 'de-DE'))).toBe('1.017 €');
  });

  it('keeps its own dash for values that are not numbers', () => {
    expect(formatEuro(null, 'de-DE')).toBe('–');
    expect(formatEuro('auf Anfrage', 'de-DE')).toBe('–');
  });
});

/**
 * A listing's price is in the currency its portal quotes, and nothing converts it. Every place that
 * prints one passes the listing's own `currency`; one without it reads as euros, which is what every
 * price was before currencies existed.
 */
describe('formatPrice, in the currency of the listing', () => {
  it('writes the symbol or code of the currency the price is in', () => {
    expect(normalize(formatPrice(2710, 'de-DE', null, 'CHF'))).toBe('2.710 CHF');
    expect(normalize(formatPrice(2710, 'en-US', null, 'CHF'))).toBe('CHF 2,710');
    expect(normalize(formatPrice(2000000, 'de-DE', null, 'DKK'))).toBe('2.000.000 DKK');
  });

  it('reads a missing or malformed currency as euros', () => {
    expect(normalize(formatPrice(1200, 'de-DE'))).toBe('1.200 €');
    expect(normalize(formatPrice(1200, 'de-DE', null, null))).toBe('1.200 €');
    expect(normalize(formatPrice(1200, 'de-DE', null, 'Franken'))).toBe('1.200 €');
  });

  it('keeps a text price as it came, with the code of its currency', () => {
    expect(formatPrice('auf Anfrage', 'de-DE', null, 'CHF')).toBe('auf Anfrage CHF');
  });

  it('keeps euros for the finance tools, whatever they are handed', () => {
    expect(normalize(formatEuroPrice(1200, 'de-DE'))).toBe('1.200 €');
  });
});

describe('normalizeCurrency', () => {
  it('upper-cases a code and falls back to euros for anything else', () => {
    expect(normalizeCurrency('chf')).toBe('CHF');
    expect(normalizeCurrency(undefined)).toBe(DEFAULT_CURRENCY);
    expect(normalizeCurrency('CH')).toBe('EUR');
  });
});

describe('currenciesOfProviders', () => {
  const providers = [{ id: 'flatfox', currency: 'CHF' }, { id: 'immoscout' }, { id: 'boligsiden', currency: 'dkk' }];

  it('reads the currency each provider declares, euros where it declares none', () => {
    expect(currenciesOfProviders(['flatfox'], providers)).toEqual(['CHF']);
    expect(currenciesOfProviders(['immoscout'], providers)).toEqual(['EUR']);
    expect(currenciesOfProviders(['immoscout', 'flatfox', 'boligsiden'], providers)).toEqual(['CHF', 'DKK', 'EUR']);
  });

  it('falls back to euros when nothing resolves', () => {
    expect(currenciesOfProviders([], providers)).toEqual(['EUR']);
    expect(currenciesOfProviders(['gone'], providers)).toEqual(['EUR']);
    expect(currenciesOfProviders(['flatfox'], null)).toEqual(['EUR']);
  });
});

describe('formatPriceInCurrencies', () => {
  it('is an ordinary price when the bound applies in one currency', () => {
    expect(normalize(formatPriceInCurrencies(1500, 'de-DE', ['CHF']))).toBe('1.500 CHF');
    expect(normalize(formatPriceInCurrencies(1500, 'de-DE', ['EUR']))).toBe('1.500 €');
  });

  // Held against each listing in its own currency, so the reader is told which ones.
  it('names every currency a bound applies in, rather than pretending to one', () => {
    expect(formatPriceInCurrencies(1500, 'de-DE', ['CHF', 'EUR'])).toBe('1.500 CHF / EUR');
  });
});

describe('chart formatting in a currency', () => {
  it('rounds and writes a whole price in the currency asked for', () => {
    expect(normalize(formatWholePrice(2710.4, 'de-DE', 'CHF'))).toBe('2.710 CHF');
    expect(formatWholePrice(null, 'de-DE', 'CHF')).toBe('–');
  });

  it('writes compact slider and axis labels in the currency asked for', () => {
    expect(normalize(formatCompactPrice(250000, 'de-DE', 'CHF'))).toMatch(/CHF$/);
    expect(normalize(formatEuroCompact(250000, 'de-DE'))).toMatch(/€$/);
  });
});
