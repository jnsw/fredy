/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_CURRENCY,
  currencyForListing,
  isDefaultCurrency,
  normalizeCurrency,
} from '../../lib/services/providers/currencies.js';

/**
 * Which currency a listing's price is in.
 *
 * The interface every provider is written against: `metaInformation.currency`, optional, absent
 * meaning euros - so no euro-country provider had to change and no installation moved. A provider
 * serving several currencies sets `currency` on the listing itself, and that wins.
 */
describe('currencies', () => {
  describe('normalizeCurrency', () => {
    it('reads a declared ISO 4217 code, whatever its case and padding', () => {
      expect(normalizeCurrency('CHF')).toBe('CHF');
      expect(normalizeCurrency(' dkk ')).toBe('DKK');
    });

    it('falls back to euros for anything that is not a code, rather than refusing to load', () => {
      for (const raw of [undefined, null, '', 'francs', 'CH', 'CHFX', 756, ['CHF'], { code: 'CHF' }]) {
        expect(normalizeCurrency(raw), JSON.stringify(raw)).toBe(DEFAULT_CURRENCY);
      }
    });

    it('defaults to euros', () => {
      expect(DEFAULT_CURRENCY).toBe('EUR');
    });
  });

  describe('isDefaultCurrency', () => {
    it('treats a missing currency as euros, which is what every price was before', () => {
      expect(isDefaultCurrency(undefined)).toBe(true);
      expect(isDefaultCurrency('eur')).toBe(true);
      expect(isDefaultCurrency('CHF')).toBe(false);
    });
  });

  describe('currencyForListing', () => {
    it("answers with the provider's declaration", () => {
      expect(currencyForListing({ currency: 'CHF' }, { price: 2710 })).toBe('CHF');
    });

    it('answers with euros for a provider that declares nothing', () => {
      expect(currencyForListing({ id: 'immoscout' }, { price: 1200 })).toBe('EUR');
      expect(currencyForListing(null, null)).toBe('EUR');
    });

    // BETTERHOMES serves .de, .at and .ch from one module, so only the listing can say.
    it("lets the listing's own currency win over the provider's", () => {
      expect(currencyForListing({}, { currency: 'CHF' })).toBe('CHF');
      expect(currencyForListing({ currency: 'CHF' }, { currency: 'EUR' })).toBe('EUR');
    });

    it("ignores a listing currency that is not a code and keeps the provider's", () => {
      expect(currencyForListing({ currency: 'CHF' }, { currency: 'Franken' })).toBe('CHF');
      expect(currencyForListing({}, { currency: 42 })).toBe('EUR');
    });
  });
});

describe('getCurrencyForListing', () => {
  /** @type {any} */
  let getCurrencyForListing;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../lib/utils.js', () => ({
      getProviders: async () => [
        { metaInformation: { id: 'swiss', currency: 'CHF' } },
        { metaInformation: { id: 'german' } },
      ],
    }));
    ({ getCurrencyForListing } = await import('../../lib/services/providers/providerCurrency.js'));
  });

  it('resolves the provider by id against the loaded modules', async () => {
    expect(await getCurrencyForListing('swiss', { price: 1 })).toBe('CHF');
    expect(await getCurrencyForListing('german', { price: 1 })).toBe('EUR');
  });

  // A listing can outlive the module that found it.
  it('answers with euros for a provider that no longer exists', async () => {
    expect(await getCurrencyForListing('gone', { price: 1 })).toBe('EUR');
  });

  it("still lets the listing's own currency win", async () => {
    expect(await getCurrencyForListing('german', { currency: 'CHF' })).toBe('CHF');
  });
});
