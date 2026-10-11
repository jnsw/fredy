/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { toJson } from '../../utils.js';
import { openJson, sealJson } from '../security/secretBox.js';

/**
 * Storage for the IMAP mailbox a user connects (`mail_accounts`) and the messages downloaded from
 * it (`mail_messages`).
 *
 * Every read is scoped by the user who owns the mailbox. An admin sees their own mail here like
 * anybody else: a mailbox is the most private thing Fredy stores, and nothing about running the
 * instance requires reading somebody else's.
 */

/** Purpose the mailbox password is sealed under, see `secretBox.js`. */
export const MAIL_PASSWORD_PURPOSE = 'mail-password';

/** Purpose sender, subject and body are sealed under. */
const MAIL_CONTENT_PURPOSE = 'mail-content';

/** How long downloaded messages are kept unless the user picks something else. */
export const DEFAULT_MAIL_RETENTION_DAYS = 90;

/** The retention periods a user can choose from, in days. */
export const MAIL_RETENTION_OPTIONS = Object.freeze([30, 90, 180, 365]);

/**
 * @typedef {Object} MailAccount
 * @property {string} id
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} mailbox
 * @property {boolean} enabled
 * @property {number} retentionDays
 * @property {boolean} hasPassword - Whether a password is stored. The password itself never leaves
 *   the server, not even to its owner.
 * @property {number|null} lastSyncAt
 * @property {string|null} lastSyncError
 */

/**
 * @typedef {Object} MailMessage
 * @property {string} id
 * @property {string|null} messageId
 * @property {string|null} senderName
 * @property {string|null} senderAddress
 * @property {string|null} subject
 * @property {string|null} textBody - Plain text only. HTML was converted on download and never stored.
 * @property {boolean} truncated - The body was cut to the storage limit, or the message was too large
 *   to download and only its envelope is here.
 * @property {boolean} unreadable - The sealed content could not be opened (the key is gone).
 * @property {number|null} receivedAt
 * @property {number} createdAt
 */

/**
 * The account as the API may show it.
 *
 * @param {Object|undefined} row
 * @returns {MailAccount|null}
 */
function publicAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    username: row.username,
    mailbox: row.mailbox,
    enabled: row.enabled === 1,
    retentionDays: row.retention_days ?? DEFAULT_MAIL_RETENTION_DAYS,
    hasPassword: typeof row.password_encrypted === 'string' && row.password_encrypted.length > 0,
    lastSyncAt: row.last_sync_at ?? null,
    lastSyncError: row.last_sync_error ?? null,
  };
}

/**
 * Open the sealed part of a message.
 *
 * A message whose content cannot be opened - the key file was lost, or a database was restored
 * onto an instance with a different key - comes back marked rather than failing the whole list.
 *
 * @param {string} contentEncrypted
 * @returns {{senderName: string|null, senderAddress: string|null, subject: string|null, textBody: string|null, truncated: boolean, unreadable: boolean}}
 */
function openContent(contentEncrypted) {
  try {
    const content = openJson(contentEncrypted, MAIL_CONTENT_PURPOSE) ?? {};
    return {
      senderName: content.senderName ?? null,
      senderAddress: content.senderAddress ?? null,
      subject: content.subject ?? null,
      textBody: content.textBody ?? null,
      truncated: content.truncated === true,
      unreadable: false,
    };
  } catch {
    return {
      senderName: null,
      senderAddress: null,
      subject: null,
      textBody: null,
      truncated: false,
      unreadable: true,
    };
  }
}

/**
 * The mailbox a user configured, without its password.
 *
 * @param {string} userId
 * @returns {MailAccount|null}
 */
export function getMailAccount(userId) {
  return publicAccount(SqliteConnection.query(`SELECT * FROM mail_accounts WHERE user_id = @userId`, { userId })[0]);
}

/**
 * The account together with its sealed password and sync cursor. Server-side use only: the sync
 * service needs them to log in and resume, and the account form needs to know whether a stored
 * password can be kept.
 *
 * @param {string} userId
 * @returns {(MailAccount & {userId: string, passwordEncrypted: string, uidValidity: string|null, lastUid: number|null})|null}
 */
export function getMailAccountWithCredential(userId) {
  const row = SqliteConnection.query(`SELECT * FROM mail_accounts WHERE user_id = @userId`, { userId })[0];
  if (!row) return null;
  return {
    ...publicAccount(row),
    userId: row.user_id,
    passwordEncrypted: row.password_encrypted,
    uidValidity: row.uid_validity ?? null,
    lastUid: row.last_uid ?? null,
  };
}

/**
 * How many mailboxes exist at all, enabled or not.
 *
 * The sync cron only runs while this is above zero, which is what keeps an installation that never
 * connected a mailbox from doing anything on a timer.
 *
 * @returns {number}
 */
export function countMailAccounts() {
  return SqliteConnection.query(`SELECT COUNT(*) AS count FROM mail_accounts`)[0]?.count ?? 0;
}

/**
 * The owners of every enabled mailbox, for the scheduled sync.
 *
 * @returns {string[]}
 */
export function getUserIdsWithEnabledMailAccount() {
  return SqliteConnection.query(`SELECT user_id AS userId FROM mail_accounts WHERE enabled = 1 ORDER BY id`).map(
    (row) => row.userId,
  );
}

/**
 * Create or update the mailbox of a user.
 *
 * Pointing the account at a different server, login or folder replaces it - new id, cursor reset,
 * downloaded messages gone with the old row through the cascade - rather than editing it in place:
 * messages from the previous mailbox would otherwise sit in the new one's inbox, and a sync still
 * running against the old id cannot write its cursor back into the new account.
 *
 * @param {Object} account
 * @param {string} account.userId
 * @param {string} account.host
 * @param {number} account.port
 * @param {string} account.username
 * @param {string} account.passwordEncrypted - Already sealed with {@link MAIL_PASSWORD_PURPOSE}.
 * @param {string} account.mailbox
 * @param {boolean} account.enabled
 * @param {number} account.retentionDays
 * @returns {MailAccount}
 */
export function upsertMailAccount(account) {
  const now = Date.now();
  const retentionDays = MAIL_RETENTION_OPTIONS.includes(Number(account.retentionDays))
    ? Number(account.retentionDays)
    : DEFAULT_MAIL_RETENTION_DAYS;

  SqliteConnection.withTransaction((db) => {
    const existing = db
      .prepare(`SELECT id, host, port, username, mailbox FROM mail_accounts WHERE user_id = @userId`)
      .get({ userId: account.userId });
    const identityChanged =
      existing != null &&
      (existing.host !== account.host ||
        existing.port !== account.port ||
        existing.username !== account.username ||
        existing.mailbox !== account.mailbox);

    if (identityChanged) {
      db.prepare(`DELETE FROM mail_accounts WHERE user_id = @userId`).run({ userId: account.userId });
    }

    db.prepare(
      `INSERT INTO mail_accounts
         (id, user_id, host, port, username, password_encrypted, mailbox, enabled, retention_days,
          created_at, updated_at)
       VALUES
         (@id, @userId, @host, @port, @username, @passwordEncrypted, @mailbox, @enabled, @retentionDays,
          @now, @now)
       ON CONFLICT(user_id) DO UPDATE SET
         password_encrypted = excluded.password_encrypted,
         enabled = excluded.enabled,
         retention_days = excluded.retention_days,
         last_sync_error = NULL,
         updated_at = excluded.updated_at`,
    ).run({
      id: existing != null && !identityChanged ? existing.id : nanoid(),
      userId: account.userId,
      host: account.host,
      port: account.port,
      username: account.username,
      passwordEncrypted: account.passwordEncrypted,
      mailbox: account.mailbox,
      enabled: account.enabled === false ? 0 : 1,
      retentionDays,
      now,
    });
  });

  return getMailAccount(account.userId);
}

/**
 * Remove a user's mailbox and, through the cascade, everything downloaded from it.
 *
 * @param {string} userId
 * @returns {boolean} Whether there was one.
 */
export function deleteMailAccount(userId) {
  return SqliteConnection.execute(`DELETE FROM mail_accounts WHERE user_id = @userId`, { userId }).changes > 0;
}

/**
 * Store one downloaded message. A UID already stored for this mailbox is ignored, so a sync that
 * is repeated after a crash cannot duplicate anything.
 *
 * @param {Object} message
 * @param {string} message.accountId
 * @param {string} message.uidValidity
 * @param {number} message.uid
 * @param {string|null} [message.messageId]
 * @param {string|null} [message.inReplyTo]
 * @param {string[]} [message.references]
 * @param {string|null} [message.senderName]
 * @param {string|null} [message.senderAddress]
 * @param {string|null} [message.subject]
 * @param {string|null} [message.textBody]
 * @param {boolean} [message.truncated]
 * @param {number|null} [message.receivedAt]
 * @returns {boolean} Whether a new row was written.
 */
export function storeMailMessage(message) {
  const contentEncrypted = sealJson(
    {
      senderName: message.senderName ?? null,
      senderAddress: message.senderAddress ?? null,
      subject: message.subject ?? null,
      textBody: message.textBody ?? null,
      truncated: message.truncated === true,
    },
    MAIL_CONTENT_PURPOSE,
  );
  const result = SqliteConnection.execute(
    `INSERT INTO mail_messages
       (id, account_id, uid_validity, uid, message_id, in_reply_to, references_json, received_at,
        content_encrypted, created_at)
     VALUES
       (@id, @accountId, @uidValidity, @uid, @messageId, @inReplyTo, @referencesJson, @receivedAt,
        @contentEncrypted, @createdAt)
     ON CONFLICT(account_id, uid_validity, uid) DO NOTHING`,
    {
      id: nanoid(),
      accountId: message.accountId,
      uidValidity: String(message.uidValidity),
      uid: message.uid,
      messageId: message.messageId ?? null,
      inReplyTo: message.inReplyTo ?? null,
      referencesJson: toJson(message.references ?? []),
      receivedAt: message.receivedAt ?? null,
      contentEncrypted,
      createdAt: Date.now(),
    },
  );
  return result.changes > 0;
}

/**
 * Record where a sync got to.
 *
 * @param {string} accountId
 * @param {string} uidValidity
 * @param {number|null} lastUid
 * @returns {void}
 */
export function markMailSyncSuccessful(accountId, uidValidity, lastUid) {
  SqliteConnection.execute(
    `UPDATE mail_accounts
        SET uid_validity = @uidValidity, last_uid = @lastUid, last_sync_at = @now, last_sync_error = NULL
      WHERE id = @accountId`,
    { accountId, uidValidity: String(uidValidity), lastUid, now: Date.now() },
  );
}

/**
 * Record that a sync failed, with a message already stripped of anything internal.
 *
 * @param {string} accountId
 * @param {string} message
 * @returns {void}
 */
export function markMailSyncFailed(accountId, message) {
  SqliteConnection.execute(
    `UPDATE mail_accounts SET last_sync_at = @now, last_sync_error = @message WHERE id = @accountId`,
    { accountId, message: String(message).slice(0, 500), now: Date.now() },
  );
}

/**
 * The newest messages in a user's mailbox.
 *
 * @param {string} userId
 * @param {number} [limit=200]
 * @returns {MailMessage[]}
 */
export function getMailMessages(userId, limit = 200) {
  return SqliteConnection.query(
    `SELECT m.id, m.message_id, m.received_at, m.created_at, m.content_encrypted
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
      WHERE a.user_id = @userId
      ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC
      LIMIT @limit`,
    { userId, limit: Math.max(1, Math.min(500, Number(limit) || 200)) },
  ).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    ...openContent(row.content_encrypted),
  }));
}

/**
 * Throw away everything downloaded from a user's mailbox, keeping the account and its cursor - so
 * the next sync continues with new mail instead of fetching the last 30 days again.
 *
 * @param {string} userId
 * @returns {number} How many messages were removed.
 */
export function deleteAllMailMessages(userId) {
  return SqliteConnection.execute(
    `DELETE FROM mail_messages WHERE account_id IN (SELECT id FROM mail_accounts WHERE user_id = @userId)`,
    { userId },
  ).changes;
}

/**
 * Remove messages older than their account's retention period.
 *
 * @param {number} [now]
 * @returns {number} How many messages were removed.
 */
export function purgeExpiredMailMessages(now = Date.now()) {
  return SqliteConnection.execute(
    `DELETE FROM mail_messages
      WHERE id IN (
        SELECT m.id
          FROM mail_messages m
          JOIN mail_accounts a ON a.id = m.account_id
         WHERE COALESCE(m.received_at, m.created_at) < @now - (a.retention_days * 86400000)
      )`,
    { now },
  ).changes;
}
