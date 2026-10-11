/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * An AI's verdict on a listing - GOOD, MAYBE or BAD - and the sentences that explain it.
 *
 * Columns of their own rather than a line in `notes`. Notes are what the user wrote, and a verdict
 * parsed back out of free text can neither be filtered on in SQL nor overwritten by the next rating
 * without risking the words around it. Four columns:
 *
 * - `ai_verdict` - `good`, `maybe` or `bad`; NULL means "not rated", which is every row today.
 * - `ai_verdict_reason` - the one to three sentences behind it.
 * - `ai_verdict_source` - who rated: the model id, or `mcp` for an assistant writing through MCP.
 *   Shown next to the verdict, because "an AI said so" is worth less than knowing which one.
 * - `ai_verdict_at` - when, in unix milliseconds.
 *
 * Nothing is backfilled: no listing has been rated before this migration, and NULL is the honest
 * answer for all of them.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  const missing = (name) => !columns.some((column) => column.name === name);

  if (missing('ai_verdict')) {
    db.exec(`ALTER TABLE listings ADD COLUMN ai_verdict TEXT`);
  }
  if (missing('ai_verdict_reason')) {
    db.exec(`ALTER TABLE listings ADD COLUMN ai_verdict_reason TEXT`);
  }
  if (missing('ai_verdict_source')) {
    db.exec(`ALTER TABLE listings ADD COLUMN ai_verdict_source TEXT`);
  }
  if (missing('ai_verdict_at')) {
    db.exec(`ALTER TABLE listings ADD COLUMN ai_verdict_at INTEGER`);
  }
}
