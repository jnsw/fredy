/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { createMailTestDb } from '../services/mail/mailTestDb.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', async () =>
  (await import('../services/mail/mailTestDb.js')).sqliteConnectionMock(() => db),
);
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getSettings: vi.fn(async () => ({})) }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));
vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../lib/services/crons/mail-sync-cron.js', () => ({ ensureMailSyncCron: vi.fn() }));
vi.mock('../../lib/services/mail/imapSyncService.js', () => ({
  syncMailAccount: vi.fn(async () => ({ fetched: 2, stored: 2 })),
  testMailConnection: vi.fn(async () => {}),
}));

const { ENCRYPTION_KEY_ENV, openSecret } = await import('../../lib/services/security/secretBox.js');
const { MAIL_PASSWORD_PURPOSE } = await import('../../lib/services/storage/mailStorage.js');
const { getSettings } = await import('../../lib/services/storage/settingsStorage.js');
const { ensureMailSyncCron } = await import('../../lib/services/crons/mail-sync-cron.js');
const { syncMailAccount, testMailConnection } = await import('../../lib/services/mail/imapSyncService.js');
const { default: mailPlugin } = await import('../../lib/api/routes/mailRouter.js');

const ACCOUNT = { host: 'imap.example.com', port: 993, username: 'me@example.org', mailbox: 'INBOX' };

async function buildApp(userId = 'u1') {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: userId };
  });
  await app.register(mailPlugin);
  await app.ready();
  return app;
}

const storedPassword = (userId = 'u1') =>
  openSecret(
    db.prepare(`SELECT password_encrypted FROM mail_accounts WHERE user_id = ?`).get(userId).password_encrypted,
    MAIL_PASSWORD_PURPOSE,
  );

describe('mail routes', () => {
  let previousKey;
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    previousKey = process.env[ENCRYPTION_KEY_ENV];
    process.env[ENCRYPTION_KEY_ENV] = 'f'.repeat(64);
    db = createMailTestDb();
    db.exec(`INSERT INTO users (id, username) VALUES ('u1', 'one'), ('u2', 'two')`);
    getSettings.mockResolvedValue({});
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    db.close();
    if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
    else process.env[ENCRYPTION_KEY_ENV] = previousKey;
  });

  const put = (body, target = app) => target.inject({ method: 'PUT', url: '/account', payload: body });

  it('answers with no account before one is configured', async () => {
    const response = await app.inject({ method: 'GET', url: '/account' });

    expect(response.json()).toEqual({ account: null });
  });

  it('stores the password encrypted and never sends it back', async () => {
    const saved = await put({ ...ACCOUNT, password: 'correct horse' });
    const read = await app.inject({ method: 'GET', url: '/account' });

    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain('correct horse');
    expect(read.body).not.toContain('correct horse');
    expect(read.json().account).toMatchObject({ host: 'imap.example.com', hasPassword: true });
    expect(read.json().account).not.toHaveProperty('password');
    expect(db.prepare(`SELECT password_encrypted FROM mail_accounts`).get().password_encrypted).not.toContain(
      'correct horse',
    );
    expect(storedPassword()).toBe('correct horse');
  });

  it('starts the sync schedule when an enabled mailbox is saved', async () => {
    await put({ ...ACCOUNT, password: 'pw' });
    expect(ensureMailSyncCron).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    await put({ ...ACCOUNT, enabled: false });
    expect(ensureMailSyncCron).not.toHaveBeenCalled();
  });

  it('requires a password for a new mailbox', async () => {
    const response = await put(ACCOUNT);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('PASSWORD_REQUIRED');
  });

  it('keeps the stored password when the form leaves it empty', async () => {
    await put({ ...ACCOUNT, password: 'correct horse' });

    const response = await put({ ...ACCOUNT, password: '', retentionDays: 30 });

    expect(response.statusCode).toBe(200);
    expect(response.json().account.retentionDays).toBe(30);
    expect(storedPassword()).toBe('correct horse');
  });

  it('does not hand the stored password to a different server', async () => {
    await put({ ...ACCOUNT, password: 'correct horse' });

    const moved = await put({ ...ACCOUNT, host: 'imap.attacker.example' });
    const renamed = await put({ ...ACCOUNT, username: 'someone-else@example.org' });

    expect(moved.statusCode).toBe(400);
    expect(moved.json().code).toBe('PASSWORD_REQUIRED');
    expect(renamed.statusCode).toBe(400);
    expect(db.prepare(`SELECT host FROM mail_accounts`).get().host).toBe('imap.example.com');
  });

  it.each([
    [{ ...ACCOUNT, host: '' }, /required/],
    [{ ...ACCOUNT, port: 25 }, /993, 143/],
    [{ ...ACCOUNT, host: '127.0.0.1' }, /public IP/],
    [{ ...ACCOUNT, host: 'nas.local' }, /public IP/],
    [{ ...ACCOUNT, retentionDays: 7 }, /retention/],
  ])('rejects an unusable account %#', async (body, message) => {
    const response = await put({ ...body, password: 'pw' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(message);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM mail_accounts`).get().n).toBe(0);
  });

  it('keeps each user to their own mailbox', async () => {
    await put({ ...ACCOUNT, password: 'pw' });
    const other = await buildApp('u2');

    const read = await other.inject({ method: 'GET', url: '/account' });
    const sync = await other.inject({ method: 'POST', url: '/sync' });
    const removed = await other.inject({ method: 'DELETE', url: '/account' });
    await other.close();

    expect(read.json()).toEqual({ account: null });
    expect(sync.statusCode).toBe(404);
    expect(removed.json()).toEqual({ deleted: false });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM mail_accounts`).get().n).toBe(1);
  });

  it('blocks changes in demo mode for everyone but admins', async () => {
    getSettings.mockResolvedValue({ demoMode: true });

    const response = await put({ ...ACCOUNT, password: 'pw' });

    expect(response.statusCode).toBe(403);
  });

  it('tests the stored connection with the decrypted password', async () => {
    await put({ ...ACCOUNT, password: 'correct horse' });

    const response = await app.inject({ method: 'POST', url: '/account/test' });

    expect(response.json()).toEqual({ success: true });
    expect(testMailConnection).toHaveBeenCalledWith(expect.objectContaining({ password: 'correct horse' }));
  });

  it('reports a failed test without the raw error', async () => {
    await put({ ...ACCOUNT, password: 'pw' });
    testMailConnection.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.1.2.3:993'));

    const response = await app.inject({ method: 'POST', url: '/account/test' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Unable to connect to the IMAP server.');
  });

  it('syncs on request', async () => {
    await put({ ...ACCOUNT, password: 'pw' });

    const response = await app.inject({ method: 'POST', url: '/sync' });

    expect(response.json()).toEqual({ fetched: 2, stored: 2 });
    expect(syncMailAccount).toHaveBeenCalledWith('u1');
  });

  it('does not sync a disabled mailbox', async () => {
    await put({ ...ACCOUNT, password: 'pw', enabled: false });

    const response = await app.inject({ method: 'POST', url: '/sync' });

    expect(response.statusCode).toBe(409);
    expect(syncMailAccount).not.toHaveBeenCalled();
  });

  describe('links to listings', () => {
    let messageId;

    beforeEach(async () => {
      db.exec(`
        INSERT INTO jobs (id, user_id, name) VALUES ('own', 'u1', 'mine'), ('other', 'u2', 'theirs');
        INSERT INTO listings (id, job_id, title, address, link, created_at) VALUES
          ('l1', 'own', 'Altbau', 'Goethestraße 18, Berlin', 'https://example.com/expose/123456', 1),
          ('l2', 'other', 'Neubau', 'Kantstraße 10, Berlin', 'https://example.com/expose/654321', 1);
      `);
      await put({ ...ACCOUNT, password: 'pw' });
      const { storeMailMessage, getMailAccount } = await import('../../lib/services/storage/mailStorage.js');
      storeMailMessage({
        accountId: getMailAccount('u1').id,
        uidValidity: '1',
        uid: 1,
        subject: 'Ihre Anfrage zu Exposé 123456',
        textBody: 'Vielen Dank.',
      });
      messageId = db.prepare(`SELECT id FROM mail_messages`).get().id;
    });

    it('links new mail on request', async () => {
      const response = await app.inject({ method: 'POST', url: '/match' });

      expect(response.json()).toEqual({ processed: 1, matched: 1, ambiguous: 0 });
      const messages = (await app.inject({ method: 'GET', url: '/messages' })).json().messages;
      expect(messages[0].match).toMatchObject({ listingId: 'l1', method: 'listing_code' });
    });

    it('links by hand, but only to the user’s own listings', async () => {
      const own = await app.inject({
        method: 'PUT',
        url: `/messages/${messageId}/listing`,
        payload: { listingId: 'l1' },
      });
      const foreign = await app.inject({
        method: 'PUT',
        url: `/messages/${messageId}/listing`,
        payload: { listingId: 'l2' },
      });

      expect(own.json()).toEqual({ assigned: true });
      expect(foreign.statusCode).toBe(404);
    });

    it('unlinks, and the next automatic run leaves the message alone', async () => {
      await app.inject({ method: 'POST', url: '/match' });

      const removed = await app.inject({ method: 'DELETE', url: `/messages/${messageId}/listing` });
      const again = await app.inject({ method: 'POST', url: '/match' });

      expect(removed.json()).toEqual({ removed: true });
      expect(again.json().matched).toBe(0);
    });

    it('lists the mail of a listing, and says when there is no mailbox at all', async () => {
      await app.inject({ method: 'POST', url: '/match' });
      const other = await buildApp('u2');

      const mine = await app.inject({ method: 'GET', url: '/listings/l1/messages' });
      const theirs = await other.inject({ method: 'GET', url: '/listings/l1/messages' });
      await other.close();

      expect(mine.json()).toMatchObject({ configured: true, messages: [{ subject: 'Ihre Anfrage zu Exposé 123456' }] });
      expect(theirs.json()).toEqual({ configured: false, messages: [] });
    });

    it('offers only the user’s own listings to link by hand', async () => {
      const response = await app.inject({ method: 'GET', url: '/listings?query=bau' });

      expect(response.json().listings.map((listing) => listing.id)).toEqual(['l1']);
    });
  });
});
