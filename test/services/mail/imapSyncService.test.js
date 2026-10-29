/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMailTestDb } from './mailTestDb.js';

let db;

vi.mock('../../../lib/services/storage/SqliteConnection.js', async () =>
  (await import('./mailTestDb.js')).sqliteConnectionMock(() => db),
);
vi.mock('../../../lib/services/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// The real client must never be built here: every test hands in a fake through `clientFactory`,
// and this makes a forgotten one fail loudly instead of dialling out.
vi.mock('imapflow', () => ({
  ImapFlow: class {
    constructor() {
      throw new Error('The real IMAP client must not be used in tests.');
    }
  },
}));

const { ENCRYPTION_KEY_ENV, sealSecret } = await import('../../../lib/services/security/secretBox.js');
const storage = await import('../../../lib/services/storage/mailStorage.js');
const { syncMailAccount, testMailConnection, MAX_MESSAGE_BYTES, INITIAL_SYNC_DAYS } =
  await import('../../../lib/services/mail/imapSyncService.js');

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../testFixtures/mail');
const fixture = (name) => fs.readFileSync(path.join(fixtureDir, name));

/**
 * A stand-in for ImapFlow serving a fixed set of messages by UID.
 *
 * @param {Object} [options]
 * @param {Record<number, Buffer>} [options.messages]
 * @param {number} [options.uidValidity]
 * @param {Record<number, number>} [options.sizes]
 * @param {number[]} [options.searchResult] - Override what SEARCH answers.
 */
function fakeClient({ messages = {}, uidValidity = 7, sizes = {}, searchResult } = {}) {
  const lock = { release: vi.fn() };
  return {
    usable: true,
    mailbox: { uidValidity: BigInt(uidValidity) },
    connect: vi.fn(async () => {}),
    getMailboxLock: vi.fn(async () => lock),
    search: vi.fn(async () => searchResult ?? Object.keys(messages).map(Number)),
    fetchOne: vi.fn(async (uid, query) => {
      const source = messages[Number(uid)];
      if (source == null) return false;
      if (query.source) return { uid: Number(uid), source };
      return { uid: Number(uid), size: sizes[Number(uid)] ?? source.length, envelope: { subject: 'Envelope only' } };
    }),
    logout: vi.fn(async () => {}),
    lock,
  };
}

describe('imapSyncService', () => {
  let previousKey;

  beforeEach(() => {
    previousKey = process.env[ENCRYPTION_KEY_ENV];
    process.env[ENCRYPTION_KEY_ENV] = 'e'.repeat(64);
    db = createMailTestDb();
    db.exec(`INSERT INTO users (id, username) VALUES ('u1', 'one')`);
    storage.upsertMailAccount({
      userId: 'u1',
      host: 'imap.example.com',
      port: 993,
      username: 'me@example.org',
      mailbox: 'Wohnungssuche',
      enabled: true,
      retentionDays: 90,
      passwordEncrypted: sealSecret('correct horse', storage.MAIL_PASSWORD_PURPOSE),
    });
  });

  afterEach(() => {
    db.close();
    if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
    else process.env[ENCRYPTION_KEY_ENV] = previousKey;
  });

  it('logs in with the decrypted password over TLS and opens the folder read-only', async () => {
    const client = fakeClient();
    const clientFactory = vi.fn(() => client);

    await syncMailAccount('u1', { clientFactory });

    expect(clientFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'imap.example.com',
        port: 993,
        secure: true,
        auth: { user: 'me@example.org', pass: 'correct horse' },
      }),
    );
    expect(client.getMailboxLock).toHaveBeenCalledWith('Wohnungssuche', { readOnly: true });
    expect(client.lock.release).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  it('looks back a bounded number of days on the first sync', async () => {
    const client = fakeClient();
    const now = Date.parse('2026-09-10T12:00:00Z');

    await syncMailAccount('u1', { clientFactory: () => client, now });

    expect(client.search).toHaveBeenCalledWith(
      { since: new Date(now - INITIAL_SYNC_DAYS * 86_400_000) },
      { uid: true },
    );
  });

  it('stores HTML-only mail as plain text, with the markup gone', async () => {
    const client = fakeClient({ messages: { 3: fixture('html-only.eml') } });

    const result = await syncMailAccount('u1', { clientFactory: () => client });

    expect(result).toEqual({ fetched: 1, stored: 1, matched: 0 });
    const [stored] = storage.getMailMessages('u1');
    expect(stored).toMatchObject({
      senderName: 'Hausverwaltung Beispiel',
      senderAddress: 'vermietung@hausverwaltung.example',
      subject: 'Ihre Anfrage zur Wohnung Musterstraße',
      messageId: '<html-only-1@hausverwaltung.example>',
      receivedAt: Date.parse('2026-09-01T07:15:00Z'),
    });
    expect(stored.textBody).toContain('vielen Dank für Ihr Interesse an der Wohnung.');
    expect(stored.textBody).not.toMatch(/<script|<p>|<img|onerror|alert\("x"\)/);
  });

  it('keeps the plain-text part of a multipart message and the thread headers', async () => {
    const client = fakeClient({ messages: { 4: fixture('plain-reply.eml') } });

    await syncMailAccount('u1', { clientFactory: () => client });

    const row = db.prepare(`SELECT in_reply_to, references_json FROM mail_messages`).get();
    expect(row.in_reply_to).toBe('<application-1@example.org>');
    expect(JSON.parse(row.references_json)).toEqual(['<application-1@example.org>']);
    expect(storage.getMailMessages('u1')[0].textBody).toBe(
      'Hallo,\n\ndanke fuer die Nachricht. Die Wohnung ist noch frei.\n\nViele Gruesse\nErika',
    );
  });

  it('resumes after the stored UID and does not store a message twice', async () => {
    const first = fakeClient({ messages: { 3: fixture('html-only.eml') } });
    await syncMailAccount('u1', { clientFactory: () => first });

    // `4:*` answers with the highest UID even when it is below 4, which is how a quiet mailbox
    // replies - so the old message comes back and must be ignored.
    const second = fakeClient({ messages: { 3: fixture('html-only.eml') }, searchResult: [3] });
    const result = await syncMailAccount('u1', { clientFactory: () => second });

    expect(second.search).toHaveBeenCalledWith({ uid: '4:*' }, { uid: true });
    expect(second.fetchOne).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, stored: 0, matched: 0 });
    expect(storage.getMailMessages('u1')).toHaveLength(1);
  });

  it('starts over when the server reports a new UIDVALIDITY', async () => {
    await syncMailAccount('u1', { clientFactory: () => fakeClient({ messages: { 3: fixture('html-only.eml') } }) });

    const rebuilt = fakeClient({ messages: { 1: fixture('plain-reply.eml') }, uidValidity: 8 });
    await syncMailAccount('u1', { clientFactory: () => rebuilt });

    expect(rebuilt.search).toHaveBeenCalledWith({ since: expect.any(Date) }, { uid: true });
    expect(storage.getMailMessages('u1')).toHaveLength(2);
  });

  it('keeps only the envelope of a message above the size limit', async () => {
    const client = fakeClient({ messages: { 5: fixture('plain-reply.eml') }, sizes: { 5: MAX_MESSAGE_BYTES + 1 } });

    await syncMailAccount('u1', { clientFactory: () => client });

    expect(client.fetchOne).toHaveBeenCalledTimes(1);
    expect(storage.getMailMessages('u1')[0]).toMatchObject({
      subject: 'Envelope only',
      textBody: null,
      truncated: true,
    });
  });

  it('records a public error and rethrows when the login fails', async () => {
    const client = fakeClient();
    client.connect.mockRejectedValue(new Error('Authentication failed for me@example.org at 10.0.0.5'));

    await expect(syncMailAccount('u1', { clientFactory: () => client })).rejects.toThrow();

    expect(storage.getMailAccount('u1').lastSyncError).toBe('IMAP authentication failed.');
  });

  it('links what arrived to the listing it is about', async () => {
    db.exec(`
      INSERT INTO jobs (id, user_id, name) VALUES ('j1', 'u1', 'Suche');
      INSERT INTO listings (id, job_id, title, address, provider, link, created_at) VALUES
        ('l1', 'j1', 'Wohnung', 'Musterstraße 5, 12345 Musterstadt', 'immoscout',
         'https://www.immobilienscout24.de/expose/123456789', 1),
        ('l2', 'j1', 'Andere', 'Lindenallee 1, 12345 Musterstadt', 'immoscout',
         'https://www.immobilienscout24.de/expose/987654321', 1);
    `);
    const client = fakeClient({ messages: { 9: fixture('viewing-invitation.eml') } });

    const result = await syncMailAccount('u1', { clientFactory: () => client });

    expect(result).toMatchObject({ stored: 1, matched: 1 });
    expect(storage.getMailMessages('u1')[0].match).toMatchObject({ listingId: 'l1', method: 'listing_code' });
    // The fixture is an invitation for 14.09.2026, 17:30 Berlin time.
    expect(JSON.parse(db.prepare(`SELECT status FROM listings WHERE id = 'l1'`).get().status)).toMatchObject({
      status: 'invited',
      appointmentAt: Date.parse('2026-09-14T15:30:00Z'),
    });
    expect(db.prepare(`SELECT status FROM listings WHERE id = 'l2'`).get().status).toBeNull();
  });

  it('keeps the mail when linking fails', async () => {
    const client = fakeClient({ messages: { 3: fixture('html-only.eml') } });
    const matcher = vi.fn(async () => {
      throw new Error('boom');
    });

    const result = await syncMailAccount('u1', { clientFactory: () => client, matcher });

    expect(result).toEqual({ fetched: 1, stored: 1, matched: 0 });
    expect(storage.getMailAccount('u1').lastSyncError).toBeNull();
  });

  it('runs one IMAP session for concurrent requests', async () => {
    const client = fakeClient({ messages: { 3: fixture('html-only.eml') } });
    const clientFactory = vi.fn(() => client);

    const [first, second] = await Promise.all([
      syncMailAccount('u1', { clientFactory }),
      syncMailAccount('u1', { clientFactory }),
    ]);

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('refuses to sync a disabled mailbox', async () => {
    storage.upsertMailAccount({
      ...storage.getMailAccountWithCredential('u1'),
      userId: 'u1',
      enabled: false,
    });
    const clientFactory = vi.fn();

    await expect(syncMailAccount('u1', { clientFactory })).rejects.toMatchObject({ code: 'MAIL_ACCOUNT_DISABLED' });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it('tests a connection without building a client for an internal host', async () => {
    const clientFactory = vi.fn();

    await expect(
      testMailConnection(
        { host: '169.254.169.254', port: 993, username: 'x', password: 'y', mailbox: 'INBOX' },
        { clientFactory },
      ),
    ).rejects.toMatchObject({ code: 'IMAP_ENDPOINT_BLOCKED' });
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
