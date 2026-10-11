/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import SqliteConnection from './SqliteConnection.js';

/**
 * Each user's own AI key and what they want listings rated by. See migration 61 for why this is a
 * table of its own.
 *
 * Two readers, deliberately: {@link getAiRatingSettings} returns the key and is for the code that
 * calls the provider; {@link toPublicAiRatingSettings} drops it and is the only shape that may
 * leave the server. There is no route that returns the key, to anyone - the owner included. The
 * settings page shows that a key is stored, never what it is.
 */

/**
 * `paused_until` for a pause only the user can lift - a rejected key, an unknown model - by saving
 * the settings again. A plain timestamp far in the future, so the "is it paused" check stays one
 * comparison.
 * @type {number}
 */
export const PAUSED_UNTIL_SAVED = Number.MAX_SAFE_INTEGER;

/**
 * Default ceiling on automatic ratings per 24 hours.
 * @type {number}
 */
export const DEFAULT_AI_DAILY_LIMIT = 50;

/**
 * @typedef {Object} AiRatingSettings
 * @property {string} userId
 * @property {('anthropic'|'openai-compatible')} provider
 * @property {string|null} apiKey - Secret. Never serialise.
 * @property {string|null} baseUrl - Only for an OpenAI-compatible server.
 * @property {string|null} model - Null means the provider's default.
 * @property {string|null} instructions - Null means the built-in rubric.
 * @property {boolean} autoRate - Whether listings found from now on are rated in the background.
 * @property {number|null} autoRateSince - Listings created before this are never rated automatically.
 * @property {number} dailyLimit - Most automatic ratings in any 24 hours.
 * @property {number|null} pausedUntil - Background rating waits until then; {@link PAUSED_UNTIL_SAVED}
 *   means until the settings are saved again.
 * @property {string|null} lastError - Why it was paused.
 * @property {number} updatedAt
 */

/**
 * @param {Object} row
 * @returns {AiRatingSettings}
 */
const fromRow = (row) => ({
  userId: row.user_id,
  provider: row.provider,
  apiKey: row.api_key ?? null,
  baseUrl: row.base_url ?? null,
  model: row.model ?? null,
  instructions: row.instructions ?? null,
  autoRate: row.auto_rate === 1,
  autoRateSince: row.auto_rate_since ?? null,
  dailyLimit: row.daily_limit ?? DEFAULT_AI_DAILY_LIMIT,
  pausedUntil: row.paused_until ?? null,
  lastError: row.last_error ?? null,
  updatedAt: row.updated_at,
});

/**
 * A user's AI rating settings, key included. Server-side use only.
 *
 * @param {string} userId
 * @returns {AiRatingSettings|null} Null when the user never set it up.
 */
export const getAiRatingSettings = (userId) => {
  if (!userId) return null;
  const row = SqliteConnection.query(`SELECT * FROM ai_rating_settings WHERE user_id = @userId LIMIT 1`, {
    userId,
  })[0];
  return row ? fromRow(row) : null;
};

/**
 * The settings as they may be shown to their owner: everything except the key, plus whether one is
 * stored.
 *
 * @param {AiRatingSettings|null} settings
 * @returns {Object|null}
 */
export const toPublicAiRatingSettings = (settings) => {
  if (settings == null) return null;
  const { apiKey, userId: _userId, ...rest } = settings;
  return { ...rest, hasApiKey: typeof apiKey === 'string' && apiKey.length > 0 };
};

/**
 * Store a user's settings, replacing what was there.
 *
 * Saving is also how a user lifts a pause: whatever made the provider refuse - a wrong key, an
 * unknown model - is presumably what they just changed, so the error and the pause are cleared and
 * the next run tries again.
 *
 * `auto_rate_since` moves only when automatic rating is switched on. Re-saving an unrelated field
 * keeps it, so listings found in between are not skipped; switching it off and on again starts
 * from that moment, so the ones found while it was off are not suddenly sent.
 *
 * @param {string} userId
 * @param {Object} values
 * @param {('anthropic'|'openai-compatible')} values.provider
 * @param {string} values.apiKey - The key to store. Callers resolve "keep the stored one" themselves.
 * @param {string|null} [values.baseUrl]
 * @param {string|null} [values.model]
 * @param {string|null} [values.instructions]
 * @param {boolean} [values.autoRate=false]
 * @param {number} [values.dailyLimit]
 * @param {number} [now=Date.now()]
 * @returns {void}
 */
export const saveAiRatingSettings = (userId, values, now = Date.now()) => {
  if (!userId) return;
  const existing = getAiRatingSettings(userId);
  const autoRate = values.autoRate === true;
  const autoRateSince = !autoRate ? null : existing?.autoRate ? (existing.autoRateSince ?? now) : now;
  SqliteConnection.execute(
    `INSERT INTO ai_rating_settings (user_id, provider, api_key, base_url, model, instructions, auto_rate,
                                     auto_rate_since, daily_limit, paused_until, last_error, updated_at)
     VALUES (@userId, @provider, @apiKey, @baseUrl, @model, @instructions, @autoRate, @autoRateSince, @dailyLimit,
             NULL, NULL, @now)
     ON CONFLICT(user_id) DO UPDATE SET provider        = excluded.provider,
                                        api_key         = excluded.api_key,
                                        base_url        = excluded.base_url,
                                        model           = excluded.model,
                                        instructions    = excluded.instructions,
                                        auto_rate       = excluded.auto_rate,
                                        auto_rate_since = excluded.auto_rate_since,
                                        daily_limit     = excluded.daily_limit,
                                        paused_until    = NULL,
                                        last_error      = NULL,
                                        updated_at      = excluded.updated_at`,
    {
      userId,
      provider: values.provider,
      apiKey: values.apiKey,
      baseUrl: values.baseUrl ?? null,
      model: values.model ?? null,
      instructions: values.instructions ?? null,
      autoRate: autoRate ? 1 : 0,
      autoRateSince,
      dailyLimit: Number.isInteger(values.dailyLimit) ? values.dailyLimit : DEFAULT_AI_DAILY_LIMIT,
      now,
    },
  );
};

/**
 * Remove a user's settings, key and all.
 *
 * @param {string} userId
 * @returns {number} Rows removed.
 */
export const deleteAiRatingSettings = (userId) => {
  if (!userId) return 0;
  return SqliteConnection.execute(`DELETE FROM ai_rating_settings WHERE user_id = @userId`, { userId })?.changes ?? 0;
};

/**
 * Everybody whose new listings should be rated now: switched on, a key stored, not paused.
 *
 * @param {number} [now=Date.now()]
 * @returns {AiRatingSettings[]}
 */
export const getAutoRatingSettings = (now = Date.now()) =>
  SqliteConnection.query(
    `SELECT *
     FROM ai_rating_settings
     WHERE auto_rate = 1
       AND auto_rate_since IS NOT NULL
       AND api_key IS NOT NULL
       AND api_key != ''
       AND (paused_until IS NULL OR paused_until <= @now)`,
    { now },
  ).map(fromRow);

/**
 * Stop background rating for a user until `until`, saying why.
 *
 * @param {string} userId
 * @param {number} until - A timestamp, or {@link PAUSED_UNTIL_SAVED}.
 * @param {string} reason - Shown on the settings page. Cut to 500 characters.
 * @returns {void}
 */
export const pauseAiRating = (userId, until, reason) => {
  if (!userId) return;
  SqliteConnection.execute(
    `UPDATE ai_rating_settings SET paused_until = @until, last_error = @reason WHERE user_id = @userId`,
    { userId, until, reason: String(reason ?? '').slice(0, 500) || null },
  );
};

/**
 * Lift a pause after a rating went through, which proves the key and the model work again.
 *
 * @param {string} userId
 * @returns {void}
 */
export const clearAiRatingPause = (userId) => {
  if (!userId) return;
  SqliteConnection.execute(
    `UPDATE ai_rating_settings
     SET paused_until = NULL, last_error = NULL
     WHERE user_id = @userId AND (paused_until IS NOT NULL OR last_error IS NOT NULL)`,
    { userId },
  );
};
