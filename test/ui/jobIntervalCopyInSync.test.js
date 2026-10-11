/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';

import * as backend from '../../lib/services/jobs/jobInterval.js';
import * as frontend from '../../ui/src/services/jobs/jobInterval.js';

/**
 * The frontend may not import out of lib/, so the bounds and the reading of a stored interval are
 * written twice. Drift would have the job form offer an interval the route refuses, or the job list
 * print an interval the scheduler does not keep.
 */
describe('job interval stays in sync between the frontend copy and lib/', () => {
  it('agrees on the bounds', () => {
    expect(frontend.MIN_JOB_INTERVAL_MINUTES).toBe(backend.MIN_JOB_INTERVAL_MINUTES);
    expect(frontend.MAX_JOB_INTERVAL_MINUTES).toBe(backend.MAX_JOB_INTERVAL_MINUTES);
    expect(frontend.MAX_INTERVAL_JITTER_PERCENT).toBe(backend.MAX_INTERVAL_JITTER_PERCENT);
  });

  it.each([null, undefined, 0, -3, 1, 4.6, 5, 15, '30', 'x', 1440, 5000])(
    'reads a stored interval of %s the same way',
    (intervalMinutes) => {
      expect(frontend.ownIntervalMinutes({ intervalMinutes })).toBe(backend.ownIntervalMinutes({ intervalMinutes }));
    },
  );
});

describe('effectiveJobInterval', () => {
  it('prefers the job’s own interval', () => {
    expect(frontend.effectiveJobInterval({ intervalMinutes: 15 }, '60')).toEqual({ minutes: 15, own: true });
  });

  it('falls back to the global interval', () => {
    expect(frontend.effectiveJobInterval({ intervalMinutes: null }, '60')).toEqual({ minutes: 60, own: false });
  });

  it('knows nothing until the settings have arrived', () => {
    expect(frontend.effectiveJobInterval({}, undefined)).toEqual({ minutes: null, own: false });
  });
});
