/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { formatListing, formatPrice, formatPriceChange } from '../../lib/utils/formatListing.js';

/**
 * Notification text used to be German whatever the user had set the interface to, because the
 * "rooms" unit was hard-coded as "Zimmer". Currency and area carry no language, so only that one
 * word follows the setting.
 */
describe('formatListing', () => {
  const listing = { id: 'l1', title: 'Flat', price: 1200, size: 74, rooms: 3 };

  it('uses the German word when the owner runs the interface in German', () => {
    expect(formatListing(listing, 'de').rooms).toBe('3 Zimmer');
  });

  it('uses the English word when the owner runs the interface in English', () => {
    expect(formatListing(listing, 'en').rooms).toBe('3 rooms');
  });

  it('defaults to English rather than German for an unknown or missing language', () => {
    expect(formatListing(listing).rooms).toBe('3 rooms');
    expect(formatListing(listing, 'fr').rooms).toBe('3 rooms');
  });

  it('formats price and size with their language-neutral units', () => {
    const formatted = formatListing(listing, 'de');
    expect(formatted.price).toBe('1.200 €');
    expect(formatted.size).toBe('74 m²');
  });

  it('leaves missing numbers as null instead of printing a bare unit', () => {
    const sparse = formatListing({ id: 'l2', title: 'Flat' }, 'de');
    expect(sparse.price).toBeNull();
    expect(sparse.size).toBeNull();
    expect(sparse.rooms).toBeNull();
  });

  it('keeps every other field untouched', () => {
    const formatted = formatListing({ ...listing, link: 'https://example.com', address: 'Main 1' }, 'en');
    expect(formatted.id).toBe('l1');
    expect(formatted.title).toBe('Flat');
    expect(formatted.link).toBe('https://example.com');
    expect(formatted.address).toBe('Main 1');
  });

  it('does not mutate the listing it was given', () => {
    const original = { ...listing };
    formatListing(listing, 'de');
    expect(listing).toEqual(original);
  });
});

describe('formatPrice', () => {
  it('groups thousands with dots so large prices stay readable', () => {
    expect(formatPrice(1000000)).toBe('1.000.000 €');
    expect(formatPrice(100000)).toBe('100.000 €');
    expect(formatPrice(1200)).toBe('1.200 €');
  });

  it('leaves small prices alone', () => {
    expect(formatPrice(800)).toBe('800 €');
    expect(formatPrice(0)).toBe('0 €');
  });

  it('uses a decimal comma and keeps at most two decimals', () => {
    expect(formatPrice(1234.5)).toBe('1.234,5 €');
    expect(formatPrice(999.999)).toBe('1.000 €');
  });

  it('uses German grouping even when the interface is English', () => {
    expect(formatListing({ id: 'l3', title: 'House', price: 450000 }, 'en').price).toBe('450.000 €');
  });

  it('writes the unit of the currency the price is in', () => {
    expect(formatPrice(2710, 'CHF')).toBe('2.710 CHF');
    expect(formatPrice(2000000, 'DKK')).toBe('2.000.000 DKK');
    expect(formatPrice(1234.5, 'chf')).toBe('1.234,5 CHF');
  });

  it('reads anything that is not a currency code as euros', () => {
    expect(formatPrice(1200, undefined)).toBe('1.200 €');
    expect(formatPrice(1200, 'Franken')).toBe('1.200 €');
  });

  // A byte that looks like a space but is not one is how a downstream parser breaks.
  it('separates the amount from the unit with a plain space', () => {
    expect(formatPrice(1200)).not.toMatch(/[  ]/);
    expect(formatPrice(1200, 'CHF')).not.toMatch(/[  ]/);
  });
});

describe('formatListing, in the currency of the listing', () => {
  it("prints a Swiss listing's price in francs", () => {
    const formatted = formatListing({ id: 'ch', title: 'Wohnung', price: 2710, currency: 'CHF' }, 'de');
    expect(formatted.price).toBe('2.710 CHF');
    // The code itself rides along for the adapters that hand listings to a machine.
    expect(formatted.currency).toBe('CHF');
  });

  it('keeps euros for a listing that carries no currency', () => {
    expect(formatListing({ id: 'old', title: 'Flat', price: 950 }).price).toBe('950 €');
  });
});

describe('formatPriceChange', () => {
  it('formats old and new price the same way as a new listing', () => {
    const formatted = formatPriceChange(
      {
        listing: { id: 'l4', title: 'House', price: 475000 },
        oldPrice: 499000,
        newPrice: 475000,
        changePercent: -4.81,
        direction: 'down',
      },
      'de',
    );
    expect(formatted.oldPrice).toBe('499.000 €');
    expect(formatted.newPrice).toBe('475.000 €');
    expect(formatted.price).toBe('475.000 €');
    expect(formatted.changePercent).toBe('-4.8 %');
  });

  it('quotes both prices in the currency of the listing', () => {
    const formatted = formatPriceChange(
      {
        listing: { id: 'l5', title: 'Wohnung', price: 2500, currency: 'CHF' },
        oldPrice: 2710,
        newPrice: 2500,
        changePercent: -7.75,
        direction: 'down',
      },
      'de',
    );
    expect(formatted.oldPrice).toBe('2.710 CHF');
    expect(formatted.newPrice).toBe('2.500 CHF');
    expect(formatted.price).toBe('2.500 CHF');
  });
});
