/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { runAiRatingSweep } from '../ai/aiRatingService.js';
import logger from '../logger.js';

/**
 * Every hour, fifty past.
 *
 * Mostly a safety net: the sweep also runs at the end of every job run, which is when new listings
 * appear. The hourly slot picks up whatever a run left over because of the per-run cap, and resumes
 * after a rate-limit pause has lifted. Fifty past keeps it clear of the geocoding sweep at the top
 * of the hour, the travel times at twenty past and the connectivity at forty past.
 * @type {string}
 */
const AI_RATING_CRON = '50 * * * *';

/**
 * Guard against a second sweep starting while the first is still working.
 *
 * Every job run ends by triggering a sweep, and several jobs finishing close together would
 * otherwise rate the same listings in parallel - each of them a paid request.
 * @type {boolean}
 */
let running = false;

/**
 * Rate the listings that are due.
 *
 * Never throws: a failed sweep costs one cycle, which must not take a job run down with it.
 *
 * @returns {Promise<boolean>} False when a sweep was already in progress.
 */
export async function runAiRating() {
  if (running) {
    logger.debug('AI rating sweep is still running. Skipping this trigger.');
    return false;
  }
  running = true;
  try {
    const { rated } = await runAiRatingSweep();
    if (rated > 0) {
      logger.debug(`AI rating sweep rated ${rated} listing(s).`);
    }
  } catch (err) {
    logger.warn('AI rating sweep failed', err);
  } finally {
    running = false;
  }
  return true;
}

/**
 * Schedule the sweep. Not run on start: the first job run after a start triggers it anyway.
 *
 * @returns {void}
 */
export function initAiRatingCron() {
  cron.schedule(AI_RATING_CRON, runAiRating);
}
