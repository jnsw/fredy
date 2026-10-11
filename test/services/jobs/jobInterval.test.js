/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import {
  MAX_INTERVAL_JITTER_PERCENT,
  MAX_JOB_INTERVAL_MINUTES,
  MIN_JOB_INTERVAL_MINUTES,
  globalIntervalMinutes,
  jitterPercent,
  latestNextRunAt,
  ownIntervalMinutes,
  parseJobInterval,
  plannedRunAt,
} from '../../../lib/services/jobs/jobInterval.js';

const MINUTE = 60_000;

describe('services/jobs/jobInterval', () => {
  describe('parseJobInterval', () => {
    it.each([undefined, null, ''])('reads %s as "follow the global interval"', (raw) => {
      expect(parseJobInterval(raw)).toEqual({ value: null, error: null });
    });

    it.each([
      [5, 5],
      ['15', 15],
      [' 30 ', 30],
      [1440, 1440],
    ])('accepts %s', (raw, value) => {
      expect(parseJobInterval(raw)).toEqual({ value, error: null });
    });

    // The floor is the point of the bounds: searching more often is what gets an instance blocked.
    it.each([4, 1, 0, -5, 1441, 7.5, 'often', '  ', {}, [15], true])(
      'refuses %j rather than bending it into range',
      (raw) => {
        const { value, error } = parseJobInterval(raw);
        expect(value).toBeNull();
        expect(error).toMatch(/intervalMinutes/);
      },
    );

    it('shares its bounds with the Execution page', () => {
      expect(MIN_JOB_INTERVAL_MINUTES).toBe(5);
      expect(MAX_JOB_INTERVAL_MINUTES).toBe(1440);
    });
  });

  describe('ownIntervalMinutes', () => {
    it.each([
      [{ intervalMinutes: null }, null],
      [{}, null],
      [null, null],
      [{ intervalMinutes: 0 }, null],
      [{ intervalMinutes: 'x' }, null],
      [{ intervalMinutes: 20 }, 20],
      // Written by hand past the route: still held to the bounds.
      [{ intervalMinutes: 1 }, 5],
      [{ intervalMinutes: 99999 }, 1440],
    ])('reads %j as %s', (job, expected) => {
      expect(ownIntervalMinutes(job)).toBe(expected);
    });
  });

  describe('globalIntervalMinutes', () => {
    it('reads the setting as stored, string or number', () => {
      expect(globalIntervalMinutes({ interval: '60' })).toBe(60);
      expect(globalIntervalMinutes({ interval: 15 })).toBe(15);
    });

    it('falls back when the setting is unusable', () => {
      expect(globalIntervalMinutes({ interval: '' }, 30)).toBe(30);
      expect(globalIntervalMinutes({}, 30)).toBe(30);
      expect(globalIntervalMinutes(null)).toBeNull();
    });
  });

  describe('jitterPercent', () => {
    it('is zero on an instance that never set it', () => {
      expect(jitterPercent({})).toBe(0);
      expect(jitterPercent(undefined)).toBe(0);
    });

    it('is held to its bounds', () => {
      expect(jitterPercent({ intervalJitterPercent: 20 })).toBe(20);
      expect(jitterPercent({ intervalJitterPercent: '10' })).toBe(10);
      expect(jitterPercent({ intervalJitterPercent: -5 })).toBe(0);
      expect(jitterPercent({ intervalJitterPercent: 90 })).toBe(MAX_INTERVAL_JITTER_PERCENT);
    });
  });

  describe('plannedRunAt', () => {
    it('is the interval after the anchor without a delay', () => {
      expect(plannedRunAt(1000, 60 * MINUTE, 0, 0.9)).toBe(1000 + 60 * MINUTE);
    });

    it('adds the drawn share of the allowance and never subtracts', () => {
      expect(plannedRunAt(0, 60 * MINUTE, 20, 0.5)).toBe(66 * MINUTE);
      expect(plannedRunAt(0, 60 * MINUTE, 20, 0)).toBe(60 * MINUTE);
      expect(plannedRunAt(0, 60 * MINUTE, 50, 0.999)).toBeLessThan(90 * MINUTE);
    });
  });

  describe('latestNextRunAt', () => {
    const settings = { interval: '30' };

    it('matches what the dashboard always showed for jobs on the global interval', () => {
      const jobs = [{ lastRunAt: 1000 }, { lastRunAt: 5000 }, { lastRunAt: null }];
      expect(latestNextRunAt(jobs, settings)).toBe(5000 + 30 * MINUTE);
    });

    it('is 0 while nothing has run', () => {
      expect(latestNextRunAt([{ lastRunAt: null }], settings)).toBe(0);
      expect(latestNextRunAt([], settings)).toBe(0);
    });

    it('takes whichever comes first, a job of its own interval or the batch', () => {
      const jobs = [
        { lastRunAt: 0, intervalMinutes: 10 },
        { lastRunAt: 0, intervalMinutes: null },
      ];
      expect(latestNextRunAt(jobs, settings)).toBe(10 * MINUTE);
    });

    it('promises the latest moment a delayed run may come', () => {
      expect(latestNextRunAt([{ lastRunAt: 0 }], { interval: '60', intervalJitterPercent: 20 })).toBe(72 * MINUTE);
    });

    it('lets a job with a longer interval of its own wait for it', () => {
      expect(latestNextRunAt([{ lastRunAt: 0, intervalMinutes: 240 }], settings)).toBe(240 * MINUTE);
    });
  });
});
