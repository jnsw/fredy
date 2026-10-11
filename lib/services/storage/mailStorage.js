/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { nanoid } from 'nanoid';
import SqliteConnection from './SqliteConnection.js';
import { fromJson, toJson } from '../../utils.js';
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
 * @property {MailMatch|null} [match] - The listing this message is about, where one is known.
 */

/**
 * @typedef {Object} MailMatch
 * @property {string} listingId
 * @property {'listing_code'|'address'|'thread'|'manual'} method - How the link was made.
 * @property {number} confidence - 0 to 100.
 * @property {{title: string|null, address: string|null, provider: string|null}} [listing]
 */

/** The ways a message can be linked to a listing, as stored in `mail_message_listing_matches`. */
export const MAIL_MATCH_METHODS = Object.freeze(['listing_code', 'address', 'thread', 'manual']);

/**
 * SQL predicate for listings that belong to the mailbox owner: listings of jobs they own, not
 * deleted by hand. Shared jobs are left out on purpose - an application, and the replies to it,
 * belong to the person whose mailbox it is, not to everyone who can see the search.
 *
 * Expects the listings table as `l`, the jobs table as `j`, and a bound `@userId`.
 * @type {string}
 */
const OWNED_LISTING_SQL = 'j.user_id = @userId AND l.manually_deleted = 0';

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
 * The newest messages in a user's mailbox, each with the listing it is linked to.
 *
 * @param {string} userId
 * @param {number} [limit=200]
 * @returns {MailMessage[]}
 */
export function getMailMessages(userId, limit = 200) {
  return SqliteConnection.query(
    `SELECT m.id, m.message_id, m.received_at, m.created_at, m.content_encrypted,
            mm.listing_id, mm.method, mm.confidence,
            l.title AS listing_title, l.address AS listing_address, l.provider AS listing_provider
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
       LEFT JOIN mail_message_listing_matches mm ON mm.message_id = m.id
       LEFT JOIN listings l ON l.id = mm.listing_id
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
    match:
      row.listing_id == null
        ? null
        : {
            listingId: row.listing_id,
            method: row.method,
            confidence: row.confidence,
            listing: { title: row.listing_title, address: row.listing_address, provider: row.listing_provider },
          },
  }));
}

/**
 * The messages linked to one listing, for the listing's own page.
 *
 * Scoped through the mailbox, not through the listing: somebody a job was shared with can open the
 * listing, but the replies in its owner's mailbox are still not theirs to read.
 *
 * @param {string} userId
 * @param {string} listingId
 * @returns {MailMessage[]}
 */
export function getMailMessagesForListing(userId, listingId) {
  return SqliteConnection.query(
    `SELECT m.id, m.message_id, m.received_at, m.created_at, m.content_encrypted,
            mm.listing_id, mm.method, mm.confidence
       FROM mail_message_listing_matches mm
       JOIN mail_messages m ON m.id = mm.message_id
       JOIN mail_accounts a ON a.id = m.account_id
      WHERE mm.listing_id = @listingId
        AND a.user_id = @userId
      ORDER BY COALESCE(m.received_at, m.created_at) DESC, m.id DESC`,
    { userId, listingId },
  ).map((row) => ({
    id: row.id,
    messageId: row.message_id,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    ...openContent(row.content_encrypted),
    match: { listingId: row.listing_id, method: row.method, confidence: row.confidence },
  }));
}

/**
 * Messages still waiting for an automatic link, newest first, a page at a time.
 *
 * Messages the user unlinked by hand are left out: the matcher would only find the same evidence
 * again.
 *
 * @param {string} userId
 * @param {number} [limit=200]
 * @param {{sortAt: number, id: string}|null} [cursor] - Where the previous page ended.
 * @returns {Array<{id: string, messageId: string|null, inReplyTo: string|null, references: string[], senderAddress: string|null, subject: string|null, textBody: string|null, sortAt: number}>}
 */
export function getUnmatchedMailMessages(userId, limit = 200, cursor = null) {
  const cursorSortAt = Number(cursor?.sortAt);
  const hasCursor = Number.isFinite(cursorSortAt) && typeof cursor?.id === 'string' && cursor.id.length > 0;
  return SqliteConnection.query(
    `SELECT m.id, m.message_id, m.in_reply_to, m.references_json, m.content_encrypted,
            COALESCE(m.received_at, m.created_at) AS sort_at
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
       LEFT JOIN mail_message_listing_matches mm ON mm.message_id = m.id
      WHERE a.user_id = @userId
        AND mm.message_id IS NULL
        AND m.auto_match = 1
        AND (
          @cursorSortAt IS NULL
          OR COALESCE(m.received_at, m.created_at) < @cursorSortAt
          OR (COALESCE(m.received_at, m.created_at) = @cursorSortAt AND m.id < @cursorId)
        )
      ORDER BY sort_at DESC, m.id DESC
      LIMIT @limit`,
    {
      userId,
      limit: Math.max(1, Math.min(500, Number(limit) || 200)),
      cursorSortAt: hasCursor ? cursorSortAt : null,
      cursorId: hasCursor ? cursor.id : '',
    },
  ).map((row) => {
    const content = openContent(row.content_encrypted);
    const references = fromJson(row.references_json, []);
    return {
      id: row.id,
      messageId: row.message_id,
      inReplyTo: row.in_reply_to,
      references: Array.isArray(references) ? references.map(String) : [],
      senderAddress: content.senderAddress,
      subject: content.subject,
      textBody: content.textBody,
      sortAt: row.sort_at,
    };
  });
}

/**
 * Message-ids of messages already linked to a listing, so a later reply in the same thread can
 * follow them even when it repeats neither the listing's code nor its address.
 *
 * @param {string} userId
 * @returns {Array<{messageId: string, listingId: string}>}
 */
export function getMatchedMailThreadAnchors(userId) {
  return SqliteConnection.query(
    `SELECT m.message_id AS messageId, mm.listing_id AS listingId
       FROM mail_messages m
       JOIN mail_accounts a ON a.id = m.account_id
       JOIN mail_message_listing_matches mm ON mm.message_id = m.id
      WHERE a.user_id = @userId
        AND m.message_id IS NOT NULL`,
    { userId },
  );
}

/**
 * The listings a user's mail can be linked to, with what the matcher reads from them.
 *
 * @param {string} userId
 * @returns {Array<{id: string, provider: string|null, title: string|null, address: string|null, link: string|null}>}
 */
export function getOwnedListingsForMailMatching(userId) {
  return SqliteConnection.query(
    `SELECT l.id, l.provider, l.title, l.address, l.link
       FROM listings l
       JOIN jobs j ON j.id = l.job_id
      WHERE ${OWNED_LISTING_SQL}
      ORDER BY l.created_at DESC`,
    { userId },
  );
}

/**
 * Search the user's listings for linking a message by hand.
 *
 * `%` and `_` typed by the user are escaped, so they are matched literally.
 *
 * @param {string} userId
 * @param {string} [query]
 * @param {number} [limit=50]
 * @returns {Array<{id: string, title: string|null, address: string|null, provider: string|null}>}
 */
export function searchOwnedListingsForMail(userId, query = '', limit = 50) {
  const normalized = String(query ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const escaped = normalized.replace(/[!%_]/g, (character) => `!${character}`);
  return SqliteConnection.query(
    `SELECT l.id, l.title, l.address, l.provider
       FROM listings l
       JOIN jobs j ON j.id = l.job_id
      WHERE ${OWNED_LISTING_SQL}
        AND (
          @query = ''
          OR LOWER(COALESCE(l.title, '') || ' ' || COALESCE(l.address, '') || ' ' || COALESCE(l.provider, ''))
             LIKE @pattern ESCAPE '!'
        )
      ORDER BY l.created_at DESC
      LIMIT @limit`,
    {
      userId,
      query: normalized,
      pattern: `%${escaped}%`,
      limit: Math.max(1, Math.min(100, Number(limit) || 50)),
    },
  );
}

/**
 * Link one of the user's messages to one of the user's listings, replacing an earlier link.
 *
 * Both sides are checked against the user inside the transaction, so neither a message id nor a
 * listing id belonging to somebody else can be linked through here.
 *
 * @param {Object} assignment
 * @param {string} assignment.userId
 * @param {string} assignment.messageId
 * @param {string} assignment.listingId
 * @param {'listing_code'|'address'|'thread'|'manual'} assignment.method
 * @param {number} assignment.confidence
 * @returns {boolean} Whether the link was stored.
 */
export function assignMailMessageToListing({ userId, messageId, listingId, method, confidence }) {
  if (!MAIL_MATCH_METHODS.includes(method)) throw new Error(`Invalid mail match method: ${method}`);

  let assigned = false;
  SqliteConnection.withTransaction((db) => {
    const message = db
      .prepare(
        `SELECT m.id
           FROM mail_messages m
           JOIN mail_accounts a ON a.id = m.account_id
          WHERE m.id = @messageId AND a.user_id = @userId`,
      )
      .get({ messageId, userId });
    const listing = db
      .prepare(
        `SELECT l.id
           FROM listings l
           JOIN jobs j ON j.id = l.job_id
          WHERE l.id = @listingId AND ${OWNED_LISTING_SQL}`,
      )
      .get({ listingId, userId });
    if (!message || !listing) return;

    const now = Date.now();
    db.prepare(
      `INSERT INTO mail_message_listing_matches (message_id, listing_id, method, confidence, created_at, updated_at)
       VALUES (@messageId, @listingId, @method, @confidence, @now, @now)
       ON CONFLICT(message_id) DO UPDATE SET
         listing_id = excluded.listing_id,
         method = excluded.method,
         confidence = excluded.confidence,
         updated_at = excluded.updated_at`,
    ).run({
      messageId,
      listingId,
      method,
      confidence: Math.max(0, Math.min(100, Math.round(Number(confidence) || 0))),
      now,
    });
    assigned = true;
  });
  return assigned;
}

/**
 * Remove a message's link and keep the matcher from making it again. The message stays, and so
 * does everything about the listing.
 *
 * @param {string} userId
 * @param {string} messageId
 * @returns {boolean} Whether there was a link to remove.
 */
export function unlinkMailMessage(userId, messageId) {
  let removed = false;
  SqliteConnection.withTransaction((db) => {
    const owned = db
      .prepare(
        `SELECT m.id
           FROM mail_messages m
           JOIN mail_accounts a ON a.id = m.account_id
          WHERE m.id = @messageId AND a.user_id = @userId`,
      )
      .get({ messageId, userId });
    if (!owned) return;
    const result = db.prepare(`DELETE FROM mail_message_listing_matches WHERE message_id = @messageId`).run({
      messageId,
    });
    removed = result.changes > 0;
    db.prepare(`UPDATE mail_messages SET auto_match = 0 WHERE id = @messageId`).run({ messageId });
  });
  return removed;
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
