/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { countActiveMapFilters } from '../../ui/src/views/listings/mapUtils.js';

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
