/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMailTestDb } from '../services/mail/mailTestDb.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', async () =>
  (await import('../services/mail/mailTestDb.js')).sqliteConnectionMock(() => db),
);

const { ENCRYPTION_KEY_ENV, sealSecret } = await import('../../lib/services/security/secretBox.js');
const storage = await import('../../lib/services/storage/mailStorage.js');

const ACCOUNT = {
  userId: 'u1',
  host: 'imap.example.com',
  port: 993,
  username: 'me@example.org',
  mailbox: 'INBOX',
  enabled: true,
  retentionDays: 90,
};

const message = (uid, overrides = {}) => ({
  accountId: storage.getMailAccount('u1').id,
  uidValidity: '7',
  uid,
  messageId: `<m${uid}@example.org>`,
  senderName: 'Erika Beispiel',
  senderAddress: 'erika@vermieterin.example',
  subject: `Betreff ${uid}`,
  textBody: `Nachricht ${uid}`,
  receivedAt: 1_780_000_000_000 + uid,
  ...overrides,
});

describe('mailStorage', () => {
  let previousKey;

  beforeEach(() => {
    previousKey = process.env[ENCRYPTION_KEY_ENV];
    process.env[ENCRYPTION_KEY_ENV] = 'c'.repeat(64);
    db = createMailTestDb();
    db.exec(`INSERT INTO users (id, username) VALUES ('u1', 'one'), ('u2', 'two')`);
  });

  afterEach(() => {
    db.close();
    if (previousKey === undefined) delete process.env[ENCRYPTION_KEY_ENV];
    else process.env[ENCRYPTION_KEY_ENV] = previousKey;
  });

  const save = (overrides = {}) =>
    storage.upsertMailAccount({
      ...ACCOUNT,
      passwordEncrypted: sealSecret('pw', storage.MAIL_PASSWORD_PURPOSE),
      ...overrides,
    });

  it('never returns the password, only whether one is stored', () => {
    const account = save();

    expect(account).toMatchObject({ host: 'imap.example.com', port: 993, enabled: true, hasPassword: true });
    expect(JSON.stringify(account)).not.toMatch(/password_encrypted|passwordEncrypted|v1\./);
  });

  it('keeps one account per user', () => {
    save();
    save({ enabled: false });

    expect(db.prepare(`SELECT COUNT(*) AS n FROM mail_accounts`).get().n).toBe(1);
    expect(storage.getMailAccount('u1').enabled).toBe(false);
    expect(storage.getMailAccount('u2')).toBeNull();
  });

  it('replaces the account and its messages when it points at another mailbox', () => {
    const first = save();
    storage.storeMailMessage(message(1));
    storage.markMailSyncSuccessful(first.id, '7', 1);

    const moved = save({ host: 'imap.other.example' });

    expect(moved.id).not.toBe(first.id);
    expect(storage.getMailMessages('u1')).toEqual([]);
    expect(storage.getMailAccountWithCredential('u1')).toMatchObject({
      host: 'imap.other.example',
      uidValidity: null,
      lastUid: null,
    });
  });

  it('keeps id, cursor and messages for a change that is not a different mailbox', () => {
    const first = save();
    storage.storeMailMessage(message(1));
    storage.markMailSyncSuccessful(first.id, '7', 1);

    const same = save({ retentionDays: 30, enabled: false });

    expect(same.id).toBe(first.id);
    expect(same.retentionDays).toBe(30);
    expect(storage.getMailMessages('u1')).toHaveLength(1);
    expect(storage.getMailAccountWithCredential('u1')).toMatchObject({ uidValidity: '7', lastUid: 1 });
  });

  it('stores sender, subject and body sealed, and reads them back', () => {
    save();
    expect(storage.storeMailMessage(message(1))).toBe(true);

    const raw = db.prepare(`SELECT * FROM mail_messages`).get();
    expect(JSON.stringify(raw)).not.toMatch(/Erika|Betreff|Nachricht|vermieterin/);

    expect(storage.getMailMessages('u1')[0]).toMatchObject({
      senderName: 'Erika Beispiel',
      senderAddress: 'erika@vermieterin.example',
      subject: 'Betreff 1',
      textBody: 'Nachricht 1',
      unreadable: false,
    });
  });

  it('ignores a UID it already has', () => {
    save();
    expect(storage.storeMailMessage(message(1))).toBe(true);
    expect(storage.storeMailMessage(message(1))).toBe(false);

    expect(storage.getMailMessages('u1')).toHaveLength(1);
  });

  it('marks a message whose content can no longer be opened instead of failing the list', () => {
    save();
    storage.storeMailMessage(message(1));
    process.env[ENCRYPTION_KEY_ENV] = 'd'.repeat(64);

    expect(storage.getMailMessages('u1')[0]).toMatchObject({ unreadable: true, subject: null, textBody: null });
  });

  it('shows a user only their own messages', () => {
    save();
    storage.storeMailMessage(message(1));

    expect(storage.getMailMessages('u2')).toEqual([]);
  });

  it('removes messages past their retention but keeps the account and cursor', () => {
    const account = save({ retentionDays: 30 });
    const now = 1_790_000_000_000;
    storage.storeMailMessage(message(1, { receivedAt: now - 31 * 86_400_000 }));
    storage.storeMailMessage(message(2, { receivedAt: now - 29 * 86_400_000 }));
    storage.markMailSyncSuccessful(account.id, '7', 2);

    expect(storage.purgeExpiredMailMessages(now)).toBe(1);
    expect(storage.getMailMessages('u1').map((m) => m.subject)).toEqual(['Betreff 2']);
    expect(db.prepare(`SELECT last_uid FROM mail_accounts`).get().last_uid).toBe(2);
  });

  it('deletes all messages on request without forgetting where the sync was', () => {
    const account = save();
    storage.storeMailMessage(message(1));
    storage.markMailSyncSuccessful(account.id, '7', 1);

    expect(storage.deleteAllMailMessages('u1')).toBe(1);
    expect(storage.getMailAccount('u1')).not.toBeNull();
    expect(db.prepare(`SELECT last_uid FROM mail_accounts`).get().last_uid).toBe(1);
  });

  it('goes away with its user, messages included', () => {
    save();
    storage.storeMailMessage(message(1));

    db.prepare(`DELETE FROM users WHERE id = 'u1'`).run();

    expect(storage.countMailAccounts()).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM mail_messages`).get().n).toBe(0);
  });

  it('lists only enabled mailboxes for the scheduled sync', () => {
    save();
    storage.upsertMailAccount({
      ...ACCOUNT,
      userId: 'u2',
      enabled: false,
      passwordEncrypted: sealSecret('pw', storage.MAIL_PASSWORD_PURPOSE),
    });

    expect(storage.countMailAccounts()).toBe(2);
    expect(storage.getUserIdsWithEnabledMailAccount()).toEqual(['u1']);
  });

  it('keeps a short, public sync error', () => {
    const account = save();
    storage.markMailSyncFailed(account.id, 'IMAP authentication failed.');

    expect(storage.getMailAccount('u1').lastSyncError).toBe('IMAP authentication failed.');
    // Saving the account again clears it: the user changed something, the old failure is stale.
    expect(save().lastSyncError).toBeNull();
  });

  describe('links to listings', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO jobs (id, user_id, name, shared_with_user) VALUES
          ('own', 'u1', 'mine', '[]'),
          ('shared', 'u2', 'theirs', '["u1"]');
        INSERT INTO listings (id, job_id, title, address, provider, link, created_at) VALUES
          ('l1', 'own', 'Altbau 100% saniert', 'Goethestraße 18, Berlin', 'immoscout', 'https://example.com/expose/123456', 2),
          ('l2', 'shared', 'Shared flat', 'Kantstraße 10, Berlin', 'immowelt', 'https://example.com/expose/654321', 1);
      `);
      save();
      storage.storeMailMessage(message(1));
    });

    const messageId = () => db.prepare(`SELECT id FROM mail_messages`).get().id;

    it('links a message to one of the owner’s listings and shows it on both sides', () => {
      expect(
        storage.assignMailMessageToListing({
          userId: 'u1',
          messageId: messageId(),
          listingId: 'l1',
          method: 'listing_code',
          confidence: 100,
        }),
      ).toBe(true);

      expect(storage.getMailMessages('u1')[0].match).toMatchObject({
        listingId: 'l1',
        method: 'listing_code',
        listing: { title: 'Altbau 100% saniert' },
      });
      expect(storage.getMailMessagesForListing('u1', 'l1')).toHaveLength(1);
      expect(storage.getMatchedMailThreadAnchors('u1')).toEqual([{ messageId: '<m1@example.org>', listingId: 'l1' }]);
    });

    it('refuses listings of a job that is only shared with the mailbox owner', () => {
      const linked = storage.assignMailMessageToListing({
        userId: 'u1',
        messageId: messageId(),
        listingId: 'l2',
        method: 'manual',
        confidence: 100,
      });

      expect(linked).toBe(false);
      expect(storage.getOwnedListingsForMailMatching('u1').map((l) => l.id)).toEqual(['l1']);
    });

    it('refuses somebody else’s message', () => {
      const linked = storage.assignMailMessageToListing({
        userId: 'u2',
        messageId: messageId(),
        listingId: 'l2',
        method: 'manual',
        confidence: 100,
      });

      expect(linked).toBe(false);
    });

    it('keeps the replies in the owner’s mailbox private from people the listing is shared with', () => {
      storage.assignMailMessageToListing({
        userId: 'u1',
        messageId: messageId(),
        listingId: 'l1',
        method: 'manual',
        confidence: 100,
      });

      expect(storage.getMailMessagesForListing('u2', 'l1')).toEqual([]);
    });

    it('stops offering a message to the matcher once the user unlinked it', () => {
      storage.assignMailMessageToListing({
        userId: 'u1',
        messageId: messageId(),
        listingId: 'l1',
        method: 'address',
        confidence: 85,
      });
      expect(storage.getUnmatchedMailMessages('u1')).toEqual([]);

      expect(storage.unlinkMailMessage('u2', messageId())).toBe(false);
      expect(storage.unlinkMailMessage('u1', messageId())).toBe(true);

      expect(storage.getMailMessages('u1')[0].match).toBeNull();
      expect(storage.getUnmatchedMailMessages('u1')).toEqual([]);
      // By hand it can still be linked again.
      expect(
        storage.assignMailMessageToListing({
          userId: 'u1',
          messageId: messageId(),
          listingId: 'l1',
          method: 'manual',
          confidence: 100,
        }),
      ).toBe(true);
    });

    it('hands unmatched messages to the matcher decrypted, with their thread headers', () => {
      storage.storeMailMessage(message(2, { inReplyTo: '<m1@example.org>', references: ['<m0@example.org>'] }));

      const [newest] = storage.getUnmatchedMailMessages('u1', 1);
      expect(newest).toMatchObject({
        messageId: '<m2@example.org>',
        inReplyTo: '<m1@example.org>',
        references: ['<m0@example.org>'],
        subject: 'Betreff 2',
        senderAddress: 'erika@vermieterin.example',
      });
      expect(storage.getUnmatchedMailMessages('u1', 1, { sortAt: newest.sortAt, id: newest.id })[0].id).not.toBe(
        newest.id,
      );
    });

    it('drops the link, not the message, when the listing is deleted', () => {
      storage.assignMailMessageToListing({
        userId: 'u1',
        messageId: messageId(),
        listingId: 'l1',
        method: 'manual',
        confidence: 100,
      });

      db.prepare(`DELETE FROM listings WHERE id = 'l1'`).run();

      expect(storage.getMailMessages('u1')).toHaveLength(1);
      expect(storage.getMailMessages('u1')[0].match).toBeNull();
    });

    const statusOf = (id) => JSON.parse(db.prepare(`SELECT status FROM listings WHERE id = ?`).get(id).status);
    const link = (statusUpdate) =>
      storage.assignMailMessageToListing({
        userId: 'u1',
        messageId: messageId(),
        listingId: 'l1',
        method: 'listing_code',
        confidence: 100,
        statusUpdate,
      });

    it('moves the listing to the stage the message announces and watches it', () => {
      link({ status: 'invited', appointmentAt: 1_790_000_000_000 });

      expect(statusOf('l1')).toMatchObject({ status: 'invited', appointmentAt: 1_790_000_000_000 });
      expect(
        db.prepare(`SELECT COUNT(*) AS n FROM watch_list WHERE listing_id = 'l1' AND user_id = 'u1'`).get().n,
      ).toBe(1);
    });

    it('never moves a listing backwards', () => {
      db.prepare(`UPDATE listings SET status = ? WHERE id = 'l1'`).run(
        JSON.stringify({ status: 'visited', setAt: 1, appointmentAt: 5 }),
      );

      link({ status: 'applied' });

      expect(statusOf('l1')).toEqual({ status: 'visited', setAt: 1, appointmentAt: 5 });
      expect(storage.getMailMessages('u1')[0].match).not.toBeNull();
    });

    it('lets a later reminder update the appointment of an invitation', () => {
      db.prepare(`UPDATE listings SET status = ? WHERE id = 'l1'`).run(
        JSON.stringify({ status: 'invited', setAt: 1, appointmentAt: 5 }),
      );

      link({ status: 'invited', appointmentAt: 9 });

      expect(statusOf('l1')).toMatchObject({ status: 'invited', appointmentAt: 9 });
    });

    it('rejects a status that does not exist', () => {
      expect(() => link({ status: 'maybe' })).toThrow(/Invalid listing status/);
    });

    it('searches the owner’s listings with wildcards taken literally', () => {
      expect(storage.searchOwnedListingsForMail('u1', 'goethe').map((l) => l.id)).toEqual(['l1']);
      expect(storage.searchOwnedListingsForMail('u1', '100%').map((l) => l.id)).toEqual(['l1']);
      expect(storage.searchOwnedListingsForMail('u1', '_')).toEqual([]);
      expect(storage.searchOwnedListingsForMail('u1', 'kant')).toEqual([]);
    });
  });
});
