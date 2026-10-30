/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import {
  COLD_RENT_SOURCES,
  NON_ALLOCABLE_COST_PCT,
  coldRentFor,
  grossYieldPercent,
  normalizeMinGrossYield,
  rentalYieldFor,
} from '../../../lib/services/finance/rentalYield.js';
import { DEFAULT_MAKLER_PCT, DEFAULT_NOTARY_PCT } from '../../../lib/services/finance/constants.js';

/** A 60 m² flat for 200.000 EUR, with the rentals around it letting at 10 EUR/m². */
const purchase = (overrides = {}) => ({
  id: 'flat',
  price: 200000,
  size: 60,
  rent_median_sqm: 10,
  rent_sample_size: 12,
  rent_radius_km: 5,
  cold_rent_override: null,
  ...overrides,
});

describe('coldRentFor', () => {
  it('scales the median rent per square metre to the flat', () => {
    expect(coldRentFor(purchase())).toEqual({
      monthly: 600,
      perSqm: 10,
      source: COLD_RENT_SOURCES.ESTIMATE,
      sampleSize: 12,
      radiusKm: 5,
    });
  });

  // The user has asked the agent or read the exposé; a median over the neighbourhood is not better.
  it('prefers the rent the user entered over the estimate', () => {
    expect(coldRentFor(purchase({ cold_rent_override: 900 }))).toEqual({
      monthly: 900,
      perSqm: 15,
      source: COLD_RENT_SOURCES.OVERRIDE,
      sampleSize: null,
      radiusKm: null,
    });
  });

  it('takes an override even where there is no estimate and no usable size', () => {
    const rent = coldRentFor(purchase({ rent_median_sqm: null, size: null, cold_rent_override: 750 }));
    expect(rent).toMatchObject({ monthly: 750, perSqm: null, source: COLD_RENT_SOURCES.OVERRIDE });
  });

  it('has no rent without an estimate or an override', () => {
    expect(coldRentFor(purchase({ rent_median_sqm: null }))).toBeNull();
    expect(coldRentFor(purchase({ rent_median_sqm: 0 }))).toBeNull();
    expect(coldRentFor(null)).toBeNull();
  });

  // A parking space quoted at "1 m²" would otherwise let for ten euros and yield nothing - or, with a
  // garage price, absurdly much.
  it('does not scale an estimate to a size no flat has', () => {
    expect(coldRentFor(purchase({ size: null }))).toBeNull();
    expect(coldRentFor(purchase({ size: 1 }))).toBeNull();
  });

  it('treats a zero or blank override as no override', () => {
    expect(coldRentFor(purchase({ cold_rent_override: 0 }))?.source).toBe(COLD_RENT_SOURCES.ESTIMATE);
    expect(coldRentFor(purchase({ cold_rent_override: '' }))?.source).toBe(COLD_RENT_SOURCES.ESTIMATE);
  });
});

describe('grossYieldPercent', () => {
  it('is a year of cold rent over the purchase price', () => {
    // 600 EUR * 12 = 7.200 EUR on 200.000 EUR.
    expect(grossYieldPercent(purchase())).toBe(3.6);
  });

  it('follows the override', () => {
    // 900 EUR * 12 = 10.800 EUR on 200.000 EUR.
    expect(grossYieldPercent(purchase({ cold_rent_override: 900 }))).toBe(5.4);
  });

  // The filter and the page read this same number, so the page can never show "5,0 %" for a listing
  // a 5 % minimum dropped.
  it('rounds to one decimal', () => {
    // 10 EUR * 61 m² * 12 / 200.000 = 3,66 %
    expect(grossYieldPercent(purchase({ size: 61 }))).toBe(3.7);
  });

  it('has no yield without a price or a rent', () => {
    expect(grossYieldPercent(purchase({ price: null }))).toBeNull();
    expect(grossYieldPercent(purchase({ price: 0 }))).toBeNull();
    expect(grossYieldPercent(purchase({ rent_median_sqm: null }))).toBeNull();
  });
});

describe('rentalYieldFor', () => {
  const financing = { bundesland: 'NW', notaryPct: DEFAULT_NOTARY_PCT, maklerPct: DEFAULT_MAKLER_PCT };

  it('reports gross yield, net yield and the Kaufpreisfaktor', () => {
    const result = rentalYieldFor(purchase(), financing);

    expect(result.grossYield).toBe(3.6);
    // 7.200 EUR less 20 % = 5.760 EUR, over 200.000 EUR plus 11,57 % Kaufnebenkosten (NRW).
    expect(result.netYield).toBe(2.6);
    // 200.000 EUR / 7.200 EUR
    expect(result.priceFactor).toBe(27.8);
    expect(result.closingCostsPct).toBe(11.57);
    expect(result.bundesland).toBe('NW');
    expect(result.nonAllocableCostPct).toBe(NON_ALLOCABLE_COST_PCT);
    expect(result.coldRent.source).toBe(COLD_RENT_SOURCES.ESTIMATE);
  });

  // The Kaufnebenkosten are the profile's, so a cheaper Bundesland is a better net yield and the same
  // gross one.
  it('takes the Kaufnebenkosten from the finance profile', () => {
    const bavaria = rentalYieldFor(purchase(), { ...financing, bundesland: 'BY' });
    const nrw = rentalYieldFor(purchase(), financing);

    expect(bavaria.grossYield).toBe(nrw.grossYield);
    expect(bavaria.closingCostsPct).toBe(8.57);
    expect(bavaria.netYield).toBeGreaterThan(nrw.netYield);
  });

  it('honours an explicit Grunderwerbsteuer override in the profile', () => {
    expect(rentalYieldFor(purchase(), { ...financing, grunderwerbsteuerPct: 0 }).closingCostsPct).toBe(5.07);
  });

  it('falls back to the default notary and agent shares without a profile', () => {
    expect(rentalYieldFor(purchase()).closingCostsPct).toBe(DEFAULT_NOTARY_PCT + DEFAULT_MAKLER_PCT);
    expect(rentalYieldFor(purchase(), null).bundesland).toBeNull();
  });

  it('has nothing to report without a price or a rent', () => {
    expect(rentalYieldFor(purchase({ rent_median_sqm: null }), financing)).toBeNull();
    expect(rentalYieldFor(purchase({ price: null }), financing)).toBeNull();
  });
});

describe('normalizeMinGrossYield', () => {
  it('reads a positive number, from a number or from the text a form sends', () => {
    expect(normalizeMinGrossYield(5)).toBe(5);
    expect(normalizeMinGrossYield('4.5')).toBe(4.5);
  });

  // An emptied field, zero and garbage all mean the same thing: no minimum.
  it('treats empty, zero and nonsense as no minimum', () => {
    for (const value of [null, undefined, '', 0, -2, 'abc', true]) {
      expect(normalizeMinGrossYield(value)).toBeNull();
    }
  });
});
