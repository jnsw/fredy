/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { openSecret } from '../security/secretBox.js';
import { publicImapErrorMessage, secureImapConnectionOptions } from './imapNetworkSecurity.js';
import {
  MAIL_PASSWORD_PURPOSE,
  getMailAccountWithCredential,
  markMailSyncFailed,
  markMailSyncSuccessful,
  storeMailMessage,
} from '../storage/mailStorage.js';

/**
 * Downloads new messages from a user's IMAP mailbox.
 *
 * Incremental by UID: the first sync looks at the last {@link INITIAL_SYNC_DAYS} days, every later
 * one asks only for UIDs above the stored cursor. A changed UIDVALIDITY - the server rebuilt the
 * folder and its UIDs mean something else now - resets the cursor and starts over with the bounded
 * first scan.
 *
 * Nothing is ever changed on the server: messages are fetched with `BODY.PEEK` semantics (ImapFlow's
 * `source` fetch), so they stay unread in the user's own mail client.
 */

/** How far back the first sync of a mailbox looks. */
export const INITIAL_SYNC_DAYS = 30;

/** Messages larger than this keep only their envelope, so an attachment cannot exhaust memory. */
export const MAX_MESSAGE_BYTES = 1024 * 1024;

/** Longest body stored, in characters. A reply to a listing is a few hundred. */
export const MAX_TEXT_LENGTH = 50_000;

/**
 * Most messages one run downloads. The cursor moves past what was processed, so a large first sync
 * simply continues on the next run instead of holding one connection open for minutes.
 */
export const MAX_MESSAGES_PER_SYNC = 200;

/** Syncs in flight, by user, so a manual sync and the scheduled one share a single session. */
const activeSyncs = new Map();

/**
 * Build the IMAP client. Tests replace this so no real server is ever contacted.
 *
 * @param {Object} config
 * @returns {ImapFlow}
 */
function defaultClientFactory(config) {
  return new ImapFlow({ ...config, logger: false, disableAutoIdle: true });
}

/**
 * The first address of an address field, as mailparser or an IMAP envelope shapes it.
 *
 * @param {Object|Object[]|undefined|null} addressObject
 * @returns {{name: string|null, address: string|null}}
 */
function firstAddress(addressObject) {
  const value = addressObject?.value?.[0] ?? addressObject?.[0] ?? null;
  return {
    name: value?.name || null,
    address: value?.address || null,
  };
}

/**
 * Message-ids a message refers to, normalised into a list.
 *
 * @param {unknown} references
 * @returns {string[]}
 */
function normalizeReferences(references) {
  if (Array.isArray(references)) return references.map(String).filter(Boolean);
  if (typeof references === 'string') return references.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * Read one message into the shape {@link storeMailMessage} takes.
 *
 * Only plain text is kept. A portal that sends HTML-only mail gets its HTML converted to text here,
 * and the markup itself is discarded - it never reaches the database or the browser.
 *
 * @param {Object} client
 * @param {number} uid
 * @returns {Promise<Object|null>}
 */
async function readMessage(client, uid) {
  const metadata = await client.fetchOne(String(uid), { uid: true, envelope: true, size: true }, { uid: true });
  if (!metadata) return null;

  let parsed = null;
  const tooLarge = metadata.size != null && metadata.size > MAX_MESSAGE_BYTES;
  if (!tooLarge) {
    const content = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (content?.source) {
      parsed = await simpleParser(content.source, {
        skipHtmlToText: false,
        skipTextToHtml: true,
        skipImageLinks: true,
      });
    }
  }

  const sender = firstAddress(parsed?.from ?? metadata.envelope?.from);
  const text = parsed?.text?.trim() || null;
  const date = parsed?.date ?? metadata.envelope?.date;
  return {
    uid: Number(metadata.uid ?? uid),
    messageId: parsed?.messageId ?? metadata.envelope?.messageId ?? null,
    inReplyTo: parsed?.inReplyTo ?? metadata.envelope?.inReplyTo ?? null,
    references: normalizeReferences(parsed?.references),
    senderName: sender.name,
    senderAddress: sender.address,
    subject: parsed?.subject ?? metadata.envelope?.subject ?? null,
    receivedAt: date instanceof Date && Number.isFinite(date.getTime()) ? date.getTime() : null,
    textBody: text == null ? null : text.slice(0, MAX_TEXT_LENGTH),
    truncated: tooLarge || (text != null && text.length > MAX_TEXT_LENGTH),
  };
}

/**
 * Log in and open the configured folder, without downloading anything.
 *
 * @param {{host: string, port: number, username: string, password: string, mailbox: string}} account
 * @param {Object} [options]
 * @param {(config: Object) => Object} [options.clientFactory]
 * @returns {Promise<void>}
 */
export async function testMailConnection(account, options = {}) {
  const clientFactory = options.clientFactory ?? defaultClientFactory;
  const client = clientFactory({
    ...secureImapConnectionOptions(account),
    auth: { user: account.username, pass: account.password },
  });
  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock(account.mailbox || 'INBOX', { readOnly: true });
  } finally {
    lock?.release();
    if (client.usable !== false) await client.logout().catch(() => {});
  }
}

/**
 * One sync of one user's mailbox.
 *
 * @param {string} userId
 * @param {Object} options
 * @returns {Promise<{fetched: number, stored: number}>}
 */
async function performMailSync(userId, options) {
  const account = getMailAccountWithCredential(userId);
  if (!account) throw Object.assign(new Error('No mailbox is configured.'), { code: 'MAIL_ACCOUNT_MISSING' });
  if (!account.enabled) throw Object.assign(new Error('The mailbox is disabled.'), { code: 'MAIL_ACCOUNT_DISABLED' });

  let client;
  let lock;
  try {
    const clientFactory = options.clientFactory ?? defaultClientFactory;
    const now = options.now ?? Date.now();
    client = clientFactory({
      ...secureImapConnectionOptions(account),
      auth: { user: account.username, pass: openSecret(account.passwordEncrypted, MAIL_PASSWORD_PURPOSE) },
    });

    await client.connect();
    lock = await client.getMailboxLock(account.mailbox, { readOnly: true });
    const uidValidity = String(client.mailbox?.uidValidity ?? '0');
    const resume = account.uidValidity === uidValidity && account.lastUid != null;
    const cursorUid = resume ? Number(account.lastUid) : null;
    const query = resume
      ? { uid: `${cursorUid + 1}:*` }
      : { since: new Date(now - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000) };
    const found = await client.search(query, { uid: true });
    // `n:*` always matches the highest UID, even when it is below n, so the filter is not optional.
    const uids = (Array.isArray(found) ? found : [])
      .map(Number)
      .filter((uid) => Number.isFinite(uid) && (cursorUid == null || uid > cursorUid))
      .sort((a, b) => a - b)
      .slice(0, MAX_MESSAGES_PER_SYNC);

    let stored = 0;
    let lastUid = cursorUid;
    for (const uid of uids) {
      const message = await readMessage(client, uid);
      if (message != null && storeMailMessage({ ...message, accountId: account.id, uidValidity })) {
        stored += 1;
      }
      lastUid = Math.max(lastUid ?? 0, message?.uid ?? uid);
    }

    markMailSyncSuccessful(account.id, uidValidity, lastUid);
    return { fetched: uids.length, stored };
  } catch (error) {
    markMailSyncFailed(account.id, publicImapErrorMessage(error));
    throw error;
  } finally {
    lock?.release();
    if (client != null && client.usable !== false) await client.logout().catch(() => {});
  }
}

/**
 * Sync a user's mailbox once.
 *
 * A second caller while a sync is running gets the running one's result rather than a second IMAP
 * session racing the first for the cursor.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @param {(config: Object) => Object} [options.clientFactory] - Replaces the IMAP client (tests).
 * @param {number} [options.now]
 * @returns {Promise<{fetched: number, stored: number}>}
 */
export async function syncMailAccount(userId, options = {}) {
  const running = activeSyncs.get(userId);
  if (running) return running;

  const operation = performMailSync(userId, options);
  activeSyncs.set(userId, operation);
  try {
    return await operation;
  } finally {
    if (activeSyncs.get(userId) === operation) activeSyncs.delete(userId);
  }
}
