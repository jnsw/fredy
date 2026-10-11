/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { parseLocaleNumber } from '../../lib/utils/parse-locale-number.js';
import { extractNumber } from '../../lib/utils/extract-number.js';

describe('parseLocaleNumber', () => {
  it('reads a comma as a thousands separator the way English writes it', () => {
    expect(parseLocaleNumber('425,000')).toBe(425000);
    expect(parseLocaleNumber('€1,250')).toBe(1250);
  });

  // The reason this parser exists next to extractNumber, which is right for German portals.
  it('does not read an English thousands comma as a decimal point, unlike extractNumber', () => {
    expect(extractNumber('425,000')).toBe(425);
    expect(parseLocaleNumber('425,000')).toBe(425000);
  });

  it('reads a period as a thousands separator the way French, Dutch and German write it', () => {
    expect(parseLocaleNumber('425.000')).toBe(425000);
    expect(parseLocaleNumber('1.250 €')).toBe(1250);
  });

  it('reads several groups in either style', () => {
    expect(parseLocaleNumber('1.234.567')).toBe(1234567);
    expect(parseLocaleNumber('1,234,567')).toBe(1234567);
  });

  it('reads one or two trailing digits as a fraction, whichever separator precedes them', () => {
    expect(parseLocaleNumber('97,5')).toBe(97.5);
    expect(parseLocaleNumber('97.5')).toBe(97.5);
    expect(parseLocaleNumber('1.250,50')).toBe(1250.5);
    expect(parseLocaleNumber('1,250.50')).toBe(1250.5);
  });

  it('reads plain figures and the units around them', () => {
    expect(parseLocaleNumber('90')).toBe(90);
    expect(parseLocaleNumber('1250€')).toBe(1250);
    expect(parseLocaleNumber('78 m²')).toBe(78);
  });

  it('passes a finite number through', () => {
    expect(parseLocaleNumber(1250)).toBe(1250);
  });

  it('answers null where there is nothing to read', () => {
    expect(parseLocaleNumber(null)).toBeNull();
    expect(parseLocaleNumber(undefined)).toBeNull();
    expect(parseLocaleNumber('')).toBeNull();
    expect(parseLocaleNumber('n/a')).toBeNull();
    expect(parseLocaleNumber('.,')).toBeNull();
    expect(parseLocaleNumber(Number.NaN)).toBeNull();
    expect(parseLocaleNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
