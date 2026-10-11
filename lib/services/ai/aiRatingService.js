/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { rateListing, AiRatingError } from './listingRater.js';
import {
  countAiRatingsSince,
  getListingsDueForAiRating,
  recordAiRatingFailure,
  setListingAiVerdict,
} from '../storage/listingsStorage.js';
import {
  PAUSED_UNTIL_SAVED,
  clearAiRatingPause,
  getAutoRatingSettings,
  pauseAiRating,
} from '../storage/aiRatingSettingsStorage.js';
import { getUser } from '../storage/userStorage.js';
import { getSettings, getUserSettings } from '../storage/settingsStorage.js';

/**
 * Rating listings with a user's own key, and storing what comes back - for the background sweep
 * and for the button in the UI alike, so both count failures and pause on the same rules.
 *
 * What keeps the bill bounded, all in one place:
 * - Nothing runs for a user who has not stored a key, and the background only for one who switched
 *   it on.
 * - The background only rates listings found after it was switched on, of the user's own jobs,
 *   still active and not hidden.
 * - At most {@link AI_RATING_LIMIT_PER_RUN} per user per run, and at most the user's daily limit in
 *   any 24 hours.
 * - A listing that fails is given up after a few attempts (`AI_RATING_FAILURE_LIMIT`).
 * - A rate limit stops the run and waits for as long as the provider asked; an outage waits
 *   {@link UNAVAILABLE_BACKOFF_MS}; a rejected key or a refused configuration waits until the user
 *   saves new settings. Nothing is retried in a loop.
 */

/**
 * Most listings rated for one user in one run. Listings beyond it wait for the next run, which
 * spreads a burst - a new search finding fifty flats at once - over time instead of firing it at the
 * provider's rate limit.
 * @type {number}
 */
export const AI_RATING_LIMIT_PER_RUN = 20;

/** The window the daily limit counts over. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How long to wait after a rate limit that did not say for how long. */
export const RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000;

/** How long to wait after the provider was unreachable or failing. */
export const UNAVAILABLE_BACKOFF_MS = 30 * 60 * 1000;

/**
 * When background rating may resume after a failure of this kind.
 *
 * @param {AiRatingError} error
 * @param {number} now
 * @returns {number}
 */
function pauseUntil(error, now) {
  if (error.kind === 'rateLimit') {
    return now + Math.max(error.retryAfterMs ?? 0, RATE_LIMIT_BACKOFF_MS);
  }
  if (error.kind === 'unavailable') {
    return now + UNAVAILABLE_BACKOFF_MS;
  }
  return PAUSED_UNTIL_SAVED;
}

/**
 * @typedef {Object} RatingOutcome
 * @property {('rated'|'failed')} status
 * @property {('good'|'maybe'|'bad')} [verdict]
 * @property {string} [reason]
 * @property {string} [source]
 * @property {('listing'|'rateLimit'|'unavailable'|'auth'|'config')} [kind] - Why it failed.
 * @property {string} [message]
 */

/**
 * Rate one listing with a user's key and store the verdict.
 *
 * Never throws for a provider failure: it records it - against the listing, or as a pause on the
 * user's settings - and reports it, so a caller rating several listings can decide whether to go on.
 *
 * @param {Object} listing - A row as `getListingById` returns it.
 * @param {import('../storage/aiRatingSettingsStorage.js').AiRatingSettings} settings - With the key.
 * @param {Object} [options]
 * @param {import('./listingRater.js').RaterDeps} [options.deps]
 * @returns {Promise<RatingOutcome>}
 */
export async function rateAndStoreListing(listing, settings, { deps } = {}) {
  const userId = settings.userId;
  // Whoever owns the key decides what it may reach: only an admin may point it at a server on the
  // local network.
  const allowPrivateBaseUrl = getUser(userId)?.isAdmin === true;
  const language = getUserSettings(userId)?.language ?? null;

  let result;
  try {
    result = await rateListing({ listing, settings, language, allowPrivateBaseUrl, deps });
  } catch (error) {
    const failure =
      error instanceof AiRatingError ? error : new AiRatingError('listing', error?.message ?? String(error));
    if (failure.kind === 'listing') {
      recordAiRatingFailure(listing.id);
    } else {
      pauseAiRating(userId, pauseUntil(failure, Date.now()), failure.message);
    }
    // The message never carries the key: the providers do not echo it, and nothing here adds it.
    logger.warn(`AI rating of listing ${listing.id} failed (${failure.kind}): ${failure.message}`);
    return { status: 'failed', kind: failure.kind, message: failure.message };
  }

  setListingAiVerdict(listing.id, result);
  if (settings.pausedUntil != null || settings.lastError != null) {
    clearAiRatingPause(userId);
  }
  return { status: 'rated', verdict: result.verdict, reason: result.reason, source: result.source };
}

/**
 * Rate the new listings of everybody who switched automatic rating on.
 *
 * Runs after every job run and once an hour. Sequential on purpose - one listing at a time per
 * user, one user after the other - because the point is to stay well under every provider's rate
 * limit, not to finish fast.
 *
 * @param {Object} [options]
 * @param {number} [options.now=Date.now()]
 * @param {import('./listingRater.js').RaterDeps} [options.deps]
 * @returns {Promise<{rated: number}>}
 */
export async function runAiRatingSweep({ now = Date.now(), deps } = {}) {
  // A demo instance is shared by strangers; nothing there may spend anybody's key in the background.
  const globalSettings = await getSettings();
  if (globalSettings?.demoMode) {
    return { rated: 0 };
  }

  let rated = 0;
  for (const settings of getAutoRatingSettings(now)) {
    try {
      const used = countAiRatingsSince(settings.userId, now - DAY_MS);
      const budget = Math.min(AI_RATING_LIMIT_PER_RUN, settings.dailyLimit - used);
      if (budget <= 0) continue;

      const due = getListingsDueForAiRating({ userId: settings.userId, since: settings.autoRateSince, limit: budget });
      for (const listing of due) {
        const outcome = await rateAndStoreListing(listing, settings, { deps });
        if (outcome.status === 'rated') {
          rated++;
        } else if (outcome.kind !== 'listing') {
          // The account, not the listing: every further call would fail the same way.
          break;
        }
      }
    } catch (error) {
      // One user's trouble must not cost everybody else their run.
      logger.warn(`AI rating sweep failed for user ${settings.userId}`, error);
    }
  }
  return { rated };
}
