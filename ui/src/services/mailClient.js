/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrDelete, xhrGet, xhrPost, xhrPut } from './xhr.js';

/**
 * Client for the signed-in user's own mailbox.
 *
 * Not a store slice, for the same reason the application letter is not one: the inbox and the
 * account form are the only readers, and both should ask the server again whenever they open.
 */

/**
 * @typedef {Object} MailAccount
 * @property {string} host
 * @property {number} port
 * @property {string} username
 * @property {string} mailbox
 * @property {boolean} enabled
 * @property {number} retentionDays
 * @property {boolean} hasPassword
 * @property {number|null} lastSyncAt
 * @property {string|null} lastSyncError
 */

/**
 * @returns {Promise<MailAccount|null>}
 */
export async function getMailAccount() {
  const response = await xhrGet('/api/mail/account');
  return response.json?.account ?? null;
}

/**
 * Save the account. Leave `password` out (or empty) to keep the stored one; the server refuses that
 * when host, port or username changed.
 *
 * @param {Object} account
 * @returns {Promise<MailAccount>}
 */
export async function saveMailAccount(account) {
  const response = await xhrPut('/api/mail/account', account);
  return response.json.account;
}

/**
 * @returns {Promise<void>}
 */
export async function deleteMailAccount() {
  await xhrDelete('/api/mail/account');
}

/**
 * Log in with the stored account without downloading anything.
 *
 * @returns {Promise<void>}
 */
export async function testMailAccount() {
  await xhrPost('/api/mail/account/test');
}

/**
 * Download new mail now.
 *
 * @returns {Promise<{fetched: number, stored: number}>}
 */
export async function syncMail() {
  const response = await xhrPost('/api/mail/sync');
  return response.json;
}

/**
 * @param {number} [limit]
 * @returns {Promise<Object[]>}
 */
export async function getMailMessages(limit = 200) {
  const response = await xhrGet(`/api/mail/messages?limit=${encodeURIComponent(limit)}`);
  return response.json?.messages ?? [];
}

/**
 * Remove everything downloaded so far; the account stays.
 *
 * @returns {Promise<void>}
 */
export async function deleteAllMailMessages() {
  await xhrDelete('/api/mail/messages');
}
