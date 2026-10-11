/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { maxPriceIn, pickPriceCurrency, withinPriceRange } from '../../ui/src/views/listings/mapUtils.js';

/**
 * The map's price filter, once its pins span more than one currency.
 *
 * Nothing converts francs into euros, so a price range is a range in one currency. Which one is
 * picked next to the slider; a pin in another currency cannot be held against the range and is hidden
 * once one is set, shown while none is.
 */
const listings = [
  { id: 'k1', price: 900 },
  { id: 'k2', price: 1400, currency: 'EUR' },
  { id: 'zh1', price: 2600, currency: 'CHF' },
  { id: 'unpriced', price: null, currency: 'CHF' },
];

describe('pickPriceCurrency', () => {
  it('works in the currency most priced pins are in, and lists every one there is', () => {
    expect(pickPriceCurrency(listings)).toEqual({ currency: 'EUR', currencies: ['CHF', 'EUR'] });
    expect(
      pickPriceCurrency([...listings, { price: 3000, currency: 'CHF' }, { price: 3100, currency: 'CHF' }]),
    ).toEqual({
      currency: 'CHF',
      currencies: ['CHF', 'EUR'],
    });
  });

  it('works in the currency the address bar asks for, when there are pins in it', () => {
    expect(pickPriceCurrency(listings, 'chf').currency).toBe('CHF');
    expect(pickPriceCurrency(listings, 'DKK').currency).toBe('EUR');
  });

  it('keeps euros, the default, on a tie and for a map with no pins', () => {
    expect(pickPriceCurrency([{ price: 1, currency: 'CHF' }, { price: 1 }]).currency).toBe('EUR');
    expect(pickPriceCurrency([])).toEqual({ currency: 'EUR', currencies: [] });
  });
});

describe('maxPriceIn', () => {
  it('tops the slider at the dearest pin in its own currency', () => {
    expect(maxPriceIn(listings, 'EUR')).toBe(1400);
    expect(maxPriceIn(listings, 'CHF')).toBe(2600);
    expect(maxPriceIn(listings, 'DKK')).toBe(0);
  });
});

describe('withinPriceRange', () => {
  const range = { min: 1000, max: 2000, currency: 'EUR' };

  it('holds a pin in the range currency against the range', () => {
    expect(withinPriceRange({ price: 1400 }, { ...range, active: true })).toBe(true);
    expect(withinPriceRange({ price: 900 }, { ...range, active: true })).toBe(false);
  });

  it('shows a pin in another currency until a range is set, then hides it', () => {
    const franc = { price: 2600, currency: 'CHF' };
    expect(withinPriceRange(franc, { ...range, active: false })).toBe(true);
    expect(withinPriceRange(franc, { ...range, active: true })).toBe(false);
  });

  it('keeps leaving out a pin without a price, as the map always did', () => {
    expect(withinPriceRange({ price: null }, { ...range, active: false })).toBe(false);
  });
});
