/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Which listing a downloaded message is about.
 *
 * One row per message at most - a reply is about one application - while a listing can collect any
 * number of messages. `method` records how the link was made, so the interface can say whether
 * Fredy guessed or the user decided: the listing's code from its portal link, its street address,
 * an earlier message of the same thread, or by hand. Both sides cascade: a message past its
 * retention or a listing that is deleted takes its links with it.
 *
 * `auto_match` on the message is switched off when the user removes a link Fredy made. Without it
 * the next sync would find the same code in the same message and put the link straight back.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_message_listing_matches (
      message_id TEXT    PRIMARY KEY REFERENCES mail_messages(id) ON DELETE CASCADE,
      listing_id TEXT    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      method     TEXT    NOT NULL CHECK (method IN ('listing_code', 'address', 'thread', 'manual')),
      confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mail_matches_listing ON mail_message_listing_matches (listing_id);

    ALTER TABLE mail_messages ADD COLUMN auto_match INTEGER NOT NULL DEFAULT 1;
  `);
}
