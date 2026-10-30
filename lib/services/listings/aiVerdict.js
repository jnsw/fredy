/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The vocabulary of an AI verdict on a listing, shared by everything that reads or writes one.
 *
 * A verdict is three words on purpose. A score from 1 to 10 invites false precision from a model
 * that has read one advert, and it cannot be filtered on without somebody picking a threshold.
 * GOOD / MAYBE / BAD maps onto the decision the reader actually makes - look at it now, look at it
 * later, skip it - and it is what the filter, the badge and the MCP tools all speak.
 *
 * Kept free of the storage layer so the MCP server, the routes and the rating service can import it
 * without dragging SQLite in behind them.
 */

/**
 * Every verdict a listing can carry. Lowercase, as stored.
 * @type {Readonly<{GOOD: 'good', MAYBE: 'maybe', BAD: 'bad'}>}
 */
export const AI_VERDICTS = Object.freeze({ GOOD: 'good', MAYBE: 'maybe', BAD: 'bad' });

/**
 * The verdicts as a list, in the order they are offered.
 * @type {string[]}
 */
export const AI_VERDICT_VALUES = Object.values(AI_VERDICTS);

/**
 * The filter value for "not rated yet". Not a verdict - a listing never stores it.
 * @type {'none'}
 */
export const AI_VERDICT_UNRATED = 'none';

/**
 * Every value the listings filter accepts.
 * @type {string[]}
 */
export const AI_VERDICT_FILTER_VALUES = [...AI_VERDICT_VALUES, AI_VERDICT_UNRATED];

/**
 * What `ai_verdict_source` holds when an assistant wrote the verdict through the MCP server. Every
 * other source is the id of the model that rated the listing with the user's own key.
 * @type {'mcp'}
 */
export const AI_VERDICT_SOURCE_MCP = 'mcp';

/**
 * The most text a verdict's reasoning may hold.
 *
 * The reasoning is meant to be one to three sentences. The ceiling is generous so an honest answer
 * is never cut, and small enough that a model which ignores its brief, or a client writing through
 * MCP, cannot park a novel on every listing row the overview reads.
 * @type {number}
 */
export const MAX_AI_VERDICT_REASON_LENGTH = 2000;

/**
 * The most text the label naming who rated a listing may hold - a model id, or `mcp`.
 * @type {number}
 */
export const MAX_AI_VERDICT_SOURCE_LENGTH = 100;

/**
 * Read a verdict from anything a caller might send.
 *
 * @param {unknown} value
 * @returns {('good'|'maybe'|'bad'|null)} The verdict, or null when the value is not one.
 */
export function normalizeAiVerdict(value) {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return AI_VERDICT_VALUES.includes(lowered) ? lowered : null;
}

/**
 * Read a filter value from a query string.
 *
 * @param {unknown} value
 * @returns {('good'|'maybe'|'bad'|'none'|null)} The filter, or null when it filters nothing.
 */
export function normalizeAiVerdictFilter(value) {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return AI_VERDICT_FILTER_VALUES.includes(lowered) ? lowered : null;
}
