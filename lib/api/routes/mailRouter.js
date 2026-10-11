/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isAdmin } from '../security.js';
import { getSettings } from '../../services/storage/settingsStorage.js';
import { openSecret, sealSecret } from '../../services/security/secretBox.js';
import { syncMailAccount, testMailConnection } from '../../services/mail/imapSyncService.js';
import {
  ALLOWED_IMAP_PORTS,
  assertSafeImapEndpoint,
  publicImapErrorMessage,
} from '../../services/mail/imapNetworkSecurity.js';
import { ensureMailSyncCron } from '../../services/crons/mail-sync-cron.js';
import {
  DEFAULT_MAIL_RETENTION_DAYS,
  MAIL_PASSWORD_PURPOSE,
  MAIL_RETENTION_OPTIONS,
  deleteAllMailMessages,
  deleteMailAccount,
  getMailAccount,
  getMailAccountWithCredential,
  getMailMessages,
  upsertMailAccount,
} from '../../services/storage/mailStorage.js';
import logger from '../../services/logger.js';

/** Longest host, username or folder name accepted. */
const MAX_FIELD_LENGTH = 255;

/** Longest password accepted. */
const MAX_PASSWORD_LENGTH = 1024;

/**
 * A request the account form sent that cannot be saved.
 */
class InvalidAccountError extends Error {}

/**
 * Validate and normalise the account fields the form sends. The password is handled separately.
 *
 * @param {Object} input
 * @returns {{host: string, port: number, username: string, mailbox: string, enabled: boolean, retentionDays: number}}
 * @throws {InvalidAccountError|Error}
 */
function normalizeAccountInput(input) {
  const host = String(input?.host ?? '').trim();
  const username = String(input?.username ?? '').trim();
  const mailbox = String(input?.mailbox ?? 'INBOX').trim() || 'INBOX';
  const port = Number(input?.port);
  if (!host || !username) throw new InvalidAccountError('Host and username are required.');
  if ([host, username, mailbox].some((value) => value.length > MAX_FIELD_LENGTH)) {
    throw new InvalidAccountError('Host, username and folder must be at most 255 characters long.');
  }
  if (!Number.isInteger(port) || !ALLOWED_IMAP_PORTS.includes(port)) {
    throw new InvalidAccountError(`IMAP port must be one of: ${ALLOWED_IMAP_PORTS.join(', ')}.`);
  }
  assertSafeImapEndpoint(host, port);
  const retentionDays = Number(input?.retentionDays ?? DEFAULT_MAIL_RETENTION_DAYS);
  if (!MAIL_RETENTION_OPTIONS.includes(retentionDays)) {
    throw new InvalidAccountError(`Mail retention must be one of: ${MAIL_RETENTION_OPTIONS.join(', ')} days.`);
  }
  return { host, port, username, mailbox, enabled: input?.enabled !== false, retentionDays };
}

/**
 * Whether this request may change anything. A demo instance is shared by strangers, and a mailbox
 * is the last thing one of them should be able to point at a server.
 *
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<boolean>}
 */
async function blockedByDemoMode(request) {
  const settings = await getSettings();
  return settings.demoMode === true && !isAdmin(request);
}

/**
 * The signed-in user's own IMAP mailbox and the messages downloaded from it.
 *
 * Everything here is scoped by the session's user. There is no route that takes a user id, so no
 * route can hand one user somebody else's mailbox - admins included.
 *
 * The stored password never travels back: `GET /account` says only whether one is stored, and the
 * form leaves the field empty to keep it.
 *
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function mailPlugin(fastify) {
  fastify.get('/account', async (request) => ({ account: getMailAccount(request.session.currentUser) }));

  fastify.put('/account', async (request, reply) => {
    if (await blockedByDemoMode(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to configure a mailbox.' });
    }
    const userId = request.session.currentUser;
    let input;
    try {
      input = normalizeAccountInput(request.body);
    } catch (error) {
      const message = error instanceof InvalidAccountError ? error.message : publicImapErrorMessage(error);
      return reply.code(400).send({ error: message });
    }

    const password = request.body?.password;
    if (password != null && (typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH)) {
      return reply.code(400).send({ error: 'The password is not valid.' });
    }

    const current = getMailAccountWithCredential(userId);
    // Keeping the stored password is only allowed while it would go to the same place. Otherwise a
    // changed host would make Fredy present the old password to a server the user - or whoever
    // got hold of their session - just typed in.
    const sameEndpoint =
      current != null &&
      current.host === input.host &&
      current.port === input.port &&
      current.username === input.username;

    let passwordEncrypted;
    try {
      if (typeof password === 'string' && password.length > 0) {
        passwordEncrypted = sealSecret(password, MAIL_PASSWORD_PURPOSE);
      } else if (sameEndpoint) {
        passwordEncrypted = current.passwordEncrypted;
      } else {
        return reply
          .code(400)
          .send({ error: 'Please enter the password for this mailbox.', code: 'PASSWORD_REQUIRED' });
      }
    } catch (error) {
      logger.error('Could not encrypt the mailbox password.', error);
      return reply.code(500).send({ error: 'The password could not be stored securely. Check the encryption key.' });
    }

    const account = upsertMailAccount({ ...input, userId, passwordEncrypted });
    if (account.enabled) ensureMailSyncCron();
    return { account };
  });

  fastify.delete('/account', async (request, reply) => {
    if (await blockedByDemoMode(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to configure a mailbox.' });
    }
    return { deleted: deleteMailAccount(request.session.currentUser) };
  });

  fastify.post('/account/test', async (request, reply) => {
    const stored = getMailAccountWithCredential(request.session.currentUser);
    if (!stored) return reply.code(404).send({ error: 'No mailbox is configured.' });
    try {
      await testMailConnection({ ...stored, password: openSecret(stored.passwordEncrypted, MAIL_PASSWORD_PURPOSE) });
      return { success: true };
    } catch (error) {
      return reply.code(400).send({ error: publicImapErrorMessage(error) });
    }
  });

  fastify.post('/sync', async (request, reply) => {
    const account = getMailAccount(request.session.currentUser);
    if (!account) return reply.code(404).send({ error: 'No mailbox is configured.' });
    if (!account.enabled) return reply.code(409).send({ error: 'The mailbox is disabled.' });
    try {
      return await syncMailAccount(request.session.currentUser);
    } catch (error) {
      return reply.code(502).send({ error: publicImapErrorMessage(error) });
    }
  });

  fastify.get('/messages', async (request) => ({
    messages: getMailMessages(request.session.currentUser, request.query?.limit),
  }));

  fastify.delete('/messages', async (request, reply) => {
    if (await blockedByDemoMode(request)) {
      return reply.code(403).send({ error: 'In demo mode, it is not allowed to change the mailbox.' });
    }
    return { deleted: deleteAllMailMessages(request.session.currentUser) };
  });
}
