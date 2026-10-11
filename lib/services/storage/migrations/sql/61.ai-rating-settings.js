/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Rating listings with each user's own AI key.
 *
 * A table of its own rather than a row in `settings`. `GET /api/user/settings` serialises the
 * user's whole settings bag to the browser on every load, so an API key stored there would be one
 * forgotten filter away from being sent back to the page - and through a backup restore or a debug
 * dump to wherever those go. Here the key sits in a column no generic reader touches, next to the
 * only things that belong with it. Fredy keeps notification credentials in plain columns too and
 * protects them by never serialising them; this follows the same rule.
 *
 * - `provider` - `anthropic` or `openai-compatible`.
 * - `api_key` - the key. Write-only: no route ever returns it.
 * - `base_url` - only for an OpenAI-compatible server.
 * - `model` - NULL means the provider's default.
 * - `instructions` - what the user wants listings judged by; NULL means the built-in rubric.
 * - `auto_rate` / `auto_rate_since` - whether new listings are rated in the background, and from
 *   when. Only listings found after that moment are rated automatically, so switching it on never
 *   sends a back catalogue of hundreds of listings to a paid API.
 * - `daily_limit` - the most automatic ratings in any 24 hours.
 * - `paused_until` / `last_error` - set when the provider refused: a rate limit pauses until it
 *   lifts, a rejected key or an unknown model until the user saves the settings again.
 *
 * And one column on listings: `ai_rating_failures`, so a listing the model cannot rate is given up
 * after a few attempts instead of being sent again on every run.
 *
 * Nothing is enabled by this migration. Without a row in the table nothing is ever rated.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_rating_settings (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'anthropic',
      api_key TEXT,
      base_url TEXT,
      model TEXT,
      instructions TEXT,
      auto_rate INTEGER NOT NULL DEFAULT 0,
      auto_rate_since INTEGER,
      daily_limit INTEGER NOT NULL DEFAULT 50,
      paused_until INTEGER,
      last_error TEXT,
      updated_at INTEGER NOT NULL
    )
  `);

  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'ai_rating_failures')) {
    db.exec(`ALTER TABLE listings ADD COLUMN ai_rating_failures INTEGER NOT NULL DEFAULT 0`);
  }
}
