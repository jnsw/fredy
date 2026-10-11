/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const root = (await import('node:path')).resolve('.');

let state;

async function loadCron() {
  vi.resetModules();
  vi.doMock(root + '/lib/services/ai/aiRatingService.js', () => ({
    runAiRatingSweep: async () => {
      state.sweeps += 1;
      if (state.throws) {
        throw new Error('database is locked');
      }
      if (state.gate != null) {
        await state.gate;
      }
      return { rated: 0 };
    },
  }));
  vi.doMock(root + '/lib/services/logger.js', () => ({
    default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  }));
  vi.doMock('node-cron', () => ({ default: { schedule: (expression) => state.scheduled.push(expression) } }));
  return import(root + '/lib/services/crons/ai-rating-cron.js');
}

/**
 * Every job run ends by triggering the AI rating, so several jobs finishing together must not start
 * several sweeps - each of them would pay for the same listings again.
 */
describe('services/crons/ai-rating-cron', () => {
  beforeEach(() => {
    state = { sweeps: 0, throws: false, scheduled: [], gate: null };
  });

  it('drops a trigger while a sweep is still running', async () => {
    let release;
    state.gate = new Promise((resolve) => {
      release = resolve;
    });
    const { runAiRating } = await loadCron();

    const first = runAiRating();
    expect(await runAiRating()).toBe(false);

    release();
    expect(await first).toBe(true);
    expect(state.sweeps).toBe(1);
  });

  it('swallows a failed sweep rather than taking the job run down with it', async () => {
    state.throws = true;
    const { runAiRating } = await loadCron();

    await expect(runAiRating()).resolves.toBe(true);
    // And the guard is released, so the next trigger runs.
    state.throws = false;
    await expect(runAiRating()).resolves.toBe(true);
    expect(state.sweeps).toBe(2);
  });

  it('schedules hourly without sweeping on start', async () => {
    const { initAiRatingCron } = await loadCron();

    initAiRatingCron();

    expect(state.scheduled).toEqual(['50 * * * *']);
    expect(state.sweeps).toBe(0);
  });
});
