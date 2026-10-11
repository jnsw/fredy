/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { countActiveMapFilters, filterByPriceRange, highestPrice } from '../../ui/src/views/listings/mapUtils.js';

const none = { filterCount: 0, priceMin: null, priceMax: null };

describe('countActiveMapFilters', () => {
  it('counts nothing on a pristine map', () => {
    expect(countActiveMapFilters(none)).toBe(0);
  });

  it('counts the listing filters it shares with the overview as the overview counts them', () => {
    expect(countActiveMapFilters({ ...none, filterCount: 3 })).toBe(3);
  });

  it('ignores a shared count that is not one', () => {
    expect(countActiveMapFilters({ ...none, filterCount: Number.NaN })).toBe(0);
    expect(countActiveMapFilters({ priceMin: null, priceMax: null })).toBe(0);
  });

  it('counts a price floor or a price ceiling as one filter, and both together still as one', () => {
    expect(countActiveMapFilters({ ...none, priceMin: 300000 })).toBe(1);
    expect(countActiveMapFilters({ ...none, priceMax: 450000 })).toBe(1);
    expect(countActiveMapFilters({ ...none, priceMin: 300000, priceMax: 450000 })).toBe(1);
  });

  it('does not count a price bound that narrows nothing', () => {
    expect(countActiveMapFilters({ ...none, priceMin: 0 })).toBe(0);
    expect(countActiveMapFilters({ ...none, priceMin: Number.NaN, priceMax: Number.NaN })).toBe(0);
  });

  it('adds them up', () => {
    expect(countActiveMapFilters({ filterCount: 2, priceMin: 1000, priceMax: null })).toBe(3);
  });
});

describe('the price range, the one filter the map applies itself', () => {
  const listings = [
    { id: 'cheap', price: 500 },
    { id: 'dear', price: 1500 },
    { id: 'no-price', price: null },
    { id: 'zero', price: 0 },
  ];
  const ids = (rows) => rows.map((row) => row.id);

  it('ends at the highest price', () => {
    expect(highestPrice(listings)).toBe(1500);
    expect(highestPrice([])).toBe(0);
  });

  it('keeps a listing without a price while the slider is untouched, as the overview does', () => {
    expect(ids(filterByPriceRange(listings, [0, 0]))).toEqual(['cheap', 'dear', 'no-price', 'zero']);
    expect(ids(filterByPriceRange(listings, [0, 1500]))).toEqual(['cheap', 'dear', 'no-price', 'zero']);
  });

  it('drops it once the range is narrowed, since it cannot be said to be inside', () => {
    expect(ids(filterByPriceRange(listings, [0, 1000]))).toEqual(['cheap']);
    expect(ids(filterByPriceRange(listings, [600, 0]))).toEqual(['dear']);
  });
});
