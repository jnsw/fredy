/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_CURRENCY as backendDefault,
  normalizeCurrency as backend,
} from '../../lib/services/providers/currencies.js';
import {
  DEFAULT_CURRENCY as frontendDefault,
  normalizeCurrency as frontend,
} from '../../ui/src/services/price/priceService.js';

/**
 * The frontend may not import out of lib/, so the reading of a currency code is written twice. The
 * server decides which currency a listing is stored in and the browser decides how to print it; if
 * the two read a code differently, a price is labelled with a currency it was not compared in.
 */
const INPUTS = ['EUR', 'CHF', 'chf', ' dkk ', 'Franken', 'CH', 'CHFX', '', null, undefined, 756, ['CHF'], {}];

describe('the currency code, read by the server and by the browser', () => {
  it('defaults to the same currency', () => {
    expect(frontendDefault).toBe(backendDefault);
  });

  it('reads every input the same way', () => {
    for (const input of INPUTS) {
      expect(frontend(input), JSON.stringify(input)).toBe(backend(input));
    }
  });
});
