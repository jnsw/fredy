/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * A user's own IMAP mailbox, and the messages Fredy downloaded from it.
 *
 * One account per user (`user_id` is unique), deleted together with the user. Nothing in here is
 * readable from the database alone:
 *
 * - `password_encrypted` is sealed by `lib/services/security/secretBox.js`, whose key lives outside
 *   the database, so a backup or a copied `listings.db` does not carry the means to log in.
 * - Each message keeps only the headers needed to sort and thread it in the clear. Sender, subject
 *   and body sit together in `content_encrypted`, sealed the same way: they are other people's
 *   names, addresses and words, and nothing needs to query them in SQL.
 *
 * The port decides the transport (993 is TLS, 143 must upgrade with STARTTLS), so there is no
 * separate flag for it.
 *
 * `uid_validity` is part of a message's identity because a server that rebuilds a mailbox may hand
 * out the same UID again; the sync cursor (`uid_validity`, `last_uid`) on the account is reset when
 * it changes. Messages older than `retention_days` are purged by the sync cron.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_accounts (
      id                 TEXT    PRIMARY KEY,
      user_id            TEXT    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      host               TEXT    NOT NULL,
      port               INTEGER NOT NULL,
      username           TEXT    NOT NULL,
      password_encrypted TEXT    NOT NULL,
      mailbox            TEXT    NOT NULL DEFAULT 'INBOX',
      enabled            INTEGER NOT NULL DEFAULT 1,
      retention_days     INTEGER NOT NULL DEFAULT 90,
      uid_validity       TEXT,
      last_uid           INTEGER,
      last_sync_at       INTEGER,
      last_sync_error    TEXT,
      created_at         INTEGER NOT NULL,
      updated_at         INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_messages (
      id                TEXT    PRIMARY KEY,
      account_id        TEXT    NOT NULL REFERENCES mail_accounts(id) ON DELETE CASCADE,
      uid_validity      TEXT    NOT NULL,
      uid               INTEGER NOT NULL,
      message_id        TEXT,
      in_reply_to       TEXT,
      references_json   TEXT    NOT NULL DEFAULT '[]',
      received_at       INTEGER,
      content_encrypted TEXT    NOT NULL,
      created_at        INTEGER NOT NULL,
      UNIQUE (account_id, uid_validity, uid)
    );

    CREATE INDEX IF NOT EXISTS idx_mail_messages_account_received
      ON mail_messages (account_id, received_at DESC);
  `);
}
