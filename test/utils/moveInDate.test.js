/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  isOutsideMoveInWindow,
  moveInToday,
  normalizeMoveInDate,
  normalizeMoveInWindow,
} from '../../lib/utils/moveInDate.js';

/** A fixed clock, so "sofort" has an answer that does not change with the day the suite runs. */
const NOW = new Date(2026, 5, 27, 23, 30);

describe('normalizeMoveInDate', () => {
  it('reads the formats the portals state their date in', () => {
    expect(normalizeMoveInDate('01.07.2026')).toBe('2026-07-01');
    expect(normalizeMoveInDate('1.6.26')).toBe('2026-06-01');
    expect(normalizeMoveInDate('2026-08-29')).toBe('2026-08-29');
    expect(normalizeMoveInDate('2026-08-29T00:00:00Z')).toBe('2026-08-29');
    expect(normalizeMoveInDate('Oktober 2026')).toBe('2026-10-01');
    expect(normalizeMoveInDate('1. September 2026')).toBe('2026-09-01');
    expect(normalizeMoveInDate('März 2027')).toBe('2027-03-01');
  });

  it('reads the date out of a label around it', () => {
    expect(normalizeMoveInDate('Bezugsfrei ab: 15.11.2026')).toBe('2026-11-15');
    expect(normalizeMoveInDate('Verfügbar: 01.08.2026')).toBe('2026-08-01');
  });

  it('takes the start of a period, which is when the flat can be moved into', () => {
    // WG-Gesucht states a sublet as its first and last day.
    expect(normalizeMoveInDate('01.08.2026 - 31.12.2026')).toBe('2026-08-01');
  });

  it('reads "sofort" as the day it is read on', () => {
    expect(normalizeMoveInDate('sofort', NOW)).toBe('2026-06-27');
    expect(normalizeMoveInDate('ab sofort', NOW)).toBe('2026-06-27');
    expect(normalizeMoveInDate('Sofort verfügbar', NOW)).toBe('2026-06-27');
    expect(moveInToday(NOW)).toBe('2026-06-27');
  });

  it('knows no date where the portal names none', () => {
    expect(normalizeMoveInDate('nach Vereinbarung')).toBeNull();
    expect(normalizeMoveInDate('Nach Absprache')).toBeNull();
    expect(normalizeMoveInDate('flexibel')).toBeNull();
    expect(normalizeMoveInDate('')).toBeNull();
    expect(normalizeMoveInDate('   ')).toBeNull();
    expect(normalizeMoveInDate(null)).toBeNull();
    expect(normalizeMoveInDate(undefined)).toBeNull();
    expect(normalizeMoveInDate(20261001)).toBeNull();
  });

  it('does not invent the year a seller left out', () => {
    // A real ImmoScout value. Which September is meant is anybody's guess.
    expect(normalizeMoveInDate('01.09./15.09.')).toBeNull();
  });

  it('refuses days that do not exist and placeholders that are not days', () => {
    expect(normalizeMoveInDate('31.02.2026')).toBeNull();
    expect(normalizeMoveInDate('32.13.2026')).toBeNull();
    expect(normalizeMoveInDate('0001-01-01T00:00:00Z')).toBeNull();
    expect(normalizeMoveInDate('9999-12-31')).toBeNull();
  });
});

describe('normalizeMoveInWindow', () => {
  it('is no filter when neither bound is a date', () => {
    expect(normalizeMoveInWindow(null)).toBeNull();
    expect(normalizeMoveInWindow({})).toBeNull();
    expect(normalizeMoveInWindow({ maxPrice: 1200 })).toBeNull();
    expect(normalizeMoveInWindow({ moveInEarliest: null, moveInLatest: null })).toBeNull();
    // The flag narrows a window, and there is none to narrow.
    expect(normalizeMoveInWindow({ moveInDateRequired: true })).toBeNull();
  });

  it('leaves either end open', () => {
    expect(normalizeMoveInWindow({ moveInEarliest: '2026-10-01' })).toEqual({
      earliest: '2026-10-01',
      latest: null,
      dateRequired: false,
    });
    expect(normalizeMoveInWindow({ moveInLatest: '2026-12-31', moveInDateRequired: true })).toEqual({
      earliest: null,
      latest: '2026-12-31',
      dateRequired: true,
    });
  });

  it('ignores a bound that is not a calendar date rather than failing the run', () => {
    expect(normalizeMoveInWindow({ moveInEarliest: '01.10.2026' })).toBeNull();
    expect(normalizeMoveInWindow({ moveInEarliest: '2026-02-30', moveInLatest: '2026-12-31' })).toEqual({
      earliest: null,
      latest: '2026-12-31',
      dateRequired: false,
    });
    expect(normalizeMoveInWindow({ moveInEarliest: 20261001 })).toBeNull();
  });

  it('reads a window entered the wrong way round as the window between its dates', () => {
    expect(normalizeMoveInWindow({ moveInEarliest: '2026-12-31', moveInLatest: '2026-10-01' })).toMatchObject({
      earliest: '2026-10-01',
      latest: '2026-12-31',
    });
  });
});

describe('isOutsideMoveInWindow', () => {
  const window = { earliest: '2026-10-01', latest: '2026-12-31', dateRequired: false };

  it('includes both bounds', () => {
    expect(isOutsideMoveInWindow('2026-10-01', window)).toBe(false);
    expect(isOutsideMoveInWindow('2026-11-15', window)).toBe(false);
    expect(isOutsideMoveInWindow('2026-12-31', window)).toBe(false);
  });

  it('rejects a date on either side', () => {
    expect(isOutsideMoveInWindow('2026-09-30', window)).toBe(true);
    expect(isOutsideMoveInWindow('2027-01-01', window)).toBe(true);
  });

  it('honours an open end', () => {
    expect(isOutsideMoveInWindow('2030-01-01', { ...window, latest: null })).toBe(false);
    expect(isOutsideMoveInWindow('2020-01-01', { ...window, earliest: null })).toBe(false);
  });

  it('never calls an unknown date outside, and no window rejects nothing', () => {
    expect(isOutsideMoveInWindow(null, { ...window, dateRequired: true })).toBe(false);
    expect(isOutsideMoveInWindow(undefined, window)).toBe(false);
    expect(isOutsideMoveInWindow('2020-01-01', null)).toBe(false);
  });
});
