/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The AI verdict vocabulary, as the browser needs it.
 *
 * Duplicated from lib/services/listings/aiVerdict.js, because the frontend must not import out of
 * lib/ (see the note in scamSignals.js next door). Only the words are copied - the server decides
 * and stores, the browser paints and filters. test/ui/aiVerdictCopyInSync.test.js fails if the two
 * lists drift apart.
 */

/**
 * Every verdict a listing can carry, in the order they are offered.
 * @type {string[]}
 */
export const AI_VERDICT_VALUES = Object.freeze(['good', 'maybe', 'bad']);

/**
 * The filter value for "not rated yet".
 * @type {'none'}
 */
export const AI_VERDICT_UNRATED = 'none';

/**
 * Every value the listings filter accepts.
 * @type {string[]}
 */
export const AI_VERDICT_FILTER_VALUES = Object.freeze([...AI_VERDICT_VALUES, AI_VERDICT_UNRATED]);

/**
 * The verdict a listing row carries, or null when it carries none the UI knows how to show.
 *
 * @param {Object|null|undefined} listing A row as the listings API returns it.
 * @returns {('good'|'maybe'|'bad'|null)}
 */
export function aiVerdictOf(listing) {
  const verdict = listing?.ai_verdict;
  return AI_VERDICT_VALUES.includes(verdict) ? verdict : null;
}
