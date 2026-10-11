/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 11, 8, 0, 0);

/**
 * The scheduler on a fake clock: when each job starts, given the settings, the jobs and how long a
 * run takes. Everything below the scheduler is a double, except the run-state guard, which is the
 * real one - "two runs of one job never overlap" is its promise, and a double would only restate it.
 */
describe('services/jobs/jobExecutionService - scheduling', () => {
  /** @type {EventEmitter} */
  let bus;
  let state;
  /** @type {Array<{id: string, at: number}>} */
  let starts;

  /**
   * @param {string} id
   * @param {Object} [extra]
   * @returns {Object}
   */
  const job = (id, extra = {}) => ({
    id,
    enabled: true,
    userId: 'u1',
    provider: [{ id: 'p' }],
    blacklist: [],
    notificationAdapter: [],
    intervalMinutes: null,
    lastRunAt: null,
    ...extra,
  });

  /**
   * Minutes after startup at which a job started, in order. Rounded to the second: a timer of zero
   * is a millisecond in Node, and the looks that follow a run carry that millisecond along.
   * @param {string} id
   * @returns {number[]}
   */
  const startsOf = (id) =>
    starts.filter((start) => start.id === id).map((start) => Math.round((start.at - T0) / 1000) / 60);

  async function startService({ intervalMinutes = 60 } = {}) {
    const root = (await import('node:path')).resolve('.');

    vi.resetModules();
    vi.doMock(root + '/lib/services/events/event-bus.js', () => ({ bus }));
    vi.doMock(root + '/lib/services/storage/jobStorage.js', () => ({
      getJob: (id) => state.jobs.find((candidate) => candidate.id === id) ?? null,
      getJobs: () => state.jobs.filter((candidate) => candidate.enabled),
      getJobsWithOwnInterval: () =>
        state.jobs
          .filter((candidate) => candidate.enabled && candidate.intervalMinutes != null)
          .map(({ id, intervalMinutes, lastRunAt }) => ({ id, intervalMinutes, lastRunAt })),
      updateJobLastRunAt: (id, at) => {
        starts.push({ id, at });
        const stored = state.jobs.find((candidate) => candidate.id === id);
        if (stored) stored.lastRunAt = at;
      },
    }));
    vi.doMock(root + '/lib/services/storage/userStorage.js', () => ({
      getUsers: () => [],
      getUser: () => null,
    }));
    vi.doMock(root + '/lib/services/storage/settingsStorage.js', () => ({
      getSettings: async () => state.settings,
    }));
    vi.doMock(root + '/lib/services/sse/sse-broker.js', () => ({ sendToUsers: () => {} }));
    vi.doMock(root + '/lib/utils.js', () => ({
      duringWorkingHoursOrNotSet: () => state.withinHours,
      getPackageVersion: async () => '0.0.0-test',
    }));
    vi.doMock(root + '/lib/services/logger.js', () => ({
      default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    }));
    vi.doMock(root + '/lib/notification/notify.js', () => ({ send: async () => [] }));
    vi.doMock(root + '/lib/services/extractor/puppeteerExtractor.js', () => ({
      launchBrowser: async () => ({ connected: true }),
      closeBrowser: async () => {},
    }));
    // A run takes `state.runMinutes` on the fake clock, so a test can hold one open across a look.
    vi.doMock(root + '/lib/FredyPipelineExecutioner.js', () => ({
      default: class {
        async execute() {
          await new Promise((resolve) => setTimeout(resolve, state.runMinutes * MINUTE));
        }
      },
    }));
    vi.doMock(root + '/lib/services/demo/demoService.js', () => ({
      isDemoJob: (jobId) => jobId === 'demo-job',
    }));
    vi.doMock(root + '/lib/services/tour/tourService.js', () => ({
      isTourJob: (jobId) => typeof jobId === 'string' && jobId.startsWith('tour-'),
    }));
    vi.doMock(root + '/lib/services/crons/connectivity-cron.js', () => ({ runConnectivity: () => {} }));

    const mod = await import(root + '/lib/services/jobs/jobExecutionService.js');
    mod.initJobExecutionService({
      providers: [{ metaInformation: { id: 'p' }, createConfig: () => ({ url: 'https://example.com/search' }) }],
      intervalMs: intervalMinutes * MINUTE,
    });
    return mod;
  }

  /** @param {number} minutes */
  const advance = (minutes) => vi.advanceTimersByTimeAsync(minutes * MINUTE);

  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
    bus = new EventEmitter();
    starts = [];
    state = {
      jobs: [],
      settings: { demoMode: false, interval: '60' },
      withinHours: true,
      runMinutes: 0,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('an instance that sets neither an own interval nor a random delay', () => {
    it('searches exactly as before: at startup, one interval later, then one interval after each batch', async () => {
      state.jobs = [job('a'), job('b')];
      state.runMinutes = 1;

      await startService();
      await advance(190);

      // Startup at 0, the first batch one interval after startup, every later batch one interval
      // after the previous one ended - the two jobs one after the other, never side by side.
      expect(startsOf('a')).toEqual([0, 60, 122, 184]);
      expect(startsOf('b')).toEqual([1, 61, 123, 185]);
    });

    it('follows the interval setting live', async () => {
      state.jobs = [job('a', { provider: [] })];

      await startService();
      await advance(61);
      state.settings = { ...state.settings, interval: '30' };
      await advance(70);

      // The batch already waiting moves as well: 30 minutes after the one at 60, not 60.
      expect(startsOf('a')).toEqual([0, 60, 90, 120]);
    });

    it('skips a batch outside working hours and tries again an interval later', async () => {
      state.jobs = [job('a', { provider: [] })];
      state.withinHours = false;

      await startService();
      await advance(90);
      state.withinHours = true;
      await advance(31);

      expect(startsOf('a')).toEqual([120]);
    });
  });

  describe('the random delay', () => {
    it('postpones a batch by its share of the interval', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      state.jobs = [job('a', { provider: [] })];
      state.settings = { ...state.settings, intervalJitterPercent: 20 };

      await startService();
      await advance(140);

      // Half of a 20 % allowance on 60 minutes is six.
      expect(startsOf('a')).toEqual([0, 66, 132]);
    });

    it('never brings a run forward, so the interval stays the floor', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      state.jobs = [job('a', { provider: [] }), job('own', { provider: [], intervalMinutes: 5 })];
      state.settings = { ...state.settings, intervalJitterPercent: 50 };

      await startService();
      await advance(61);

      expect(startsOf('a')).toEqual([0, 60]);
      expect(startsOf('own')).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
    });

    it('stretches a job with its own interval as well', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      state.jobs = [job('own', { provider: [], intervalMinutes: 20 })];
      state.settings = { ...state.settings, intervalJitterPercent: 50 };

      await startService();
      await advance(60);

      // 20 minutes plus half of a 50 % allowance: every 25.
      expect(startsOf('own')).toEqual([0, 25, 50]);
    });
  });

  describe('a job with an interval of its own', () => {
    it('runs on its own interval and is left out of the batch', async () => {
      state.jobs = [job('global', { provider: [] }), job('own', { provider: [], intervalMinutes: 25 })];

      await startService();
      await advance(121);

      expect(startsOf('global')).toEqual([0, 60, 120]);
      // Not at 60 or 120: the batch does not take it along.
      expect(startsOf('own')).toEqual([0, 25, 50, 75, 100]);
    });

    it('counts its interval from the end of the previous run', async () => {
      state.jobs = [job('own', { intervalMinutes: 10 })];
      state.runMinutes = 3;

      await startService();
      await advance(40);

      expect(startsOf('own')).toEqual([0, 13, 26, 39]);
    });

    it('picks up an interval edited in the meantime without a restart', async () => {
      state.jobs = [job('own', { provider: [], intervalMinutes: 30 })];

      await startService();
      await advance(10);
      state.jobs[0].intervalMinutes = 15;
      await advance(21);

      expect(startsOf('own')).toEqual([0, 15, 30]);
    });

    it('is held to the five-minute floor even when the stored value is lower', async () => {
      state.jobs = [job('own', { provider: [], intervalMinutes: 1 })];

      await startService();
      await advance(16);

      expect(startsOf('own')).toEqual([0, 5, 10, 15]);
    });

    it('waits one interval after it was saved before its first scheduled run', async () => {
      await startService();
      await advance(2.5);
      state.jobs = [job('new', { provider: [], intervalMinutes: 10 })];
      await advance(20);

      // First seen at the look at minute 3, so due at 13 - not at once.
      expect(startsOf('new')).toEqual([13]);
    });

    it('counts from its last run before a restart when it missed the startup run', async () => {
      // Switched off at startup, so the startup run passed it by; switched on later, it is due one
      // interval after the run it had before the restart, not one interval after being switched on.
      state.jobs = [job('own', { provider: [], intervalMinutes: 30, enabled: false, lastRunAt: T0 - 20 * MINUTE })];

      await startService();
      await advance(2);
      state.jobs[0].enabled = true;
      await advance(20);

      expect(startsOf('own')).toEqual([10]);
    });
  });

  describe('runs started by hand', () => {
    it('restart the cycle of a job with its own interval', async () => {
      state.jobs = [job('own', { provider: [], intervalMinutes: 15 })];

      await startService();
      await advance(10);
      bus.emit('jobs:runOne', { jobId: 'own' });
      await advance(30);

      // 10 by hand, then one interval after that - not again at 15.
      expect(startsOf('own')).toEqual([0, 10, 25, 40]);
    });

    it('still work outside working hours', async () => {
      state.jobs = [job('own', { provider: [], intervalMinutes: 15 })];
      state.withinHours = false;

      await startService();
      await advance(5);
      bus.emit('jobs:runOne', { jobId: 'own' });
      await advance(30);

      expect(startsOf('own')).toEqual([5]);
    });
  });

  describe('working hours and overlapping runs', () => {
    it('keeps a due job waiting outside working hours and runs it once the window opens', async () => {
      state.jobs = [job('own', { provider: [], intervalMinutes: 15 })];

      await startService();
      state.withinHours = false;
      await advance(30.5);
      state.withinHours = true;
      await advance(1);

      expect(startsOf('own')).toEqual([0, 31]);
    });

    it('never starts a job that is still running', async () => {
      state.jobs = [job('own', { intervalMinutes: 5 })];
      state.runMinutes = 12;

      await startService();
      await advance(20);
      // In the middle of the scheduled run that started at 17.
      bus.emit('jobs:runOne', { jobId: 'own' });
      await advance(30);

      expect(startsOf('own')).toEqual([0, 17, 34]);
      const runs = startsOf('own');
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i] - runs[i - 1]).toBeGreaterThanOrEqual(state.runMinutes);
      }
    });

    it('skips a due job while a run started by hand is still going', async () => {
      state.jobs = [job('own', { intervalMinutes: 5 })];
      state.runMinutes = 0;

      await startService();
      await advance(3);
      state.runMinutes = 10;
      bus.emit('jobs:runOne', { jobId: 'own' });
      await advance(17);

      // Due at 5 by the startup run, but busy from 3 to 13; counted again from 13.
      expect(startsOf('own')).toEqual([0, 3, 18]);
    });
  });

  it('runs no job of its own interval on a demo instance except the demo job', async () => {
    state.jobs = [job('visitor', { provider: [], intervalMinutes: 5 })];
    state.settings = { ...state.settings, demoMode: true };

    await startService();
    await advance(30);

    expect(startsOf('visitor')).toEqual([]);
  });
});
