/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  accounts: 0,
  enabledUsers: [],
  failingUsers: new Set(),
  synced: [],
  purged: 0,
  tasks: [],
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expression, handler) => {
      const task = { expression, handler, destroyed: false, destroy: vi.fn(() => (task.destroyed = true)) };
      state.tasks.push(task);
      return task;
    }),
  },
}));
vi.mock('../../../lib/services/storage/mailStorage.js', () => ({
  countMailAccounts: () => state.accounts,
  getUserIdsWithEnabledMailAccount: () => state.enabledUsers,
  purgeExpiredMailMessages: () => {
    state.purged += 1;
    return 0;
  },
}));
vi.mock('../../../lib/services/mail/imapSyncService.js', () => ({
  syncMailAccount: vi.fn(async (userId) => {
    state.synced.push(userId);
    if (state.failingUsers.has(userId)) throw new Error('IMAP authentication failed.');
    return { fetched: 0, stored: 0 };
  }),
}));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
}));

const cronModule = await import('../../../lib/services/crons/mail-sync-cron.js');

/**
 * The mail sync schedule. Its one hard promise: an instance where nobody connected a mailbox does
 * nothing on this timer at all.
 */
describe('services/crons/mail-sync-cron', () => {
  beforeEach(() => {
    cronModule.stopMailSyncCron();
    Object.assign(state, { accounts: 0, enabledUsers: [], failingUsers: new Set(), synced: [], purged: 0, tasks: [] });
  });

  it('schedules nothing on startup when no mailbox exists', () => {
    cronModule.initMailSyncCron();

    expect(state.tasks).toHaveLength(0);
    expect(cronModule.isMailSyncScheduled()).toBe(false);
  });

  it('schedules on startup when a mailbox exists, and only once', () => {
    state.accounts = 1;

    cronModule.initMailSyncCron();
    cronModule.ensureMailSyncCron();

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].expression).toBe(cronModule.MAIL_SYNC_CRON);
  });

  it('syncs every enabled mailbox and keeps going past a broken one', async () => {
    state.accounts = 3;
    state.enabledUsers = ['u1', 'u2', 'u3'];
    state.failingUsers = new Set(['u2']);

    const result = await cronModule.runMailSync();

    expect(state.synced).toEqual(['u1', 'u2', 'u3']);
    expect(result).toMatchObject({ accounts: 3, succeeded: 2, failed: 1, skipped: false });
    expect(state.purged).toBe(1);
  });

  it('purges expired mail even when every mailbox is disabled', async () => {
    state.accounts = 1;

    await cronModule.runMailSync();

    expect(state.synced).toEqual([]);
    expect(state.purged).toBe(1);
  });

  it('stops its own schedule once the last mailbox is gone', async () => {
    state.accounts = 1;
    cronModule.ensureMailSyncCron();
    state.accounts = 0;

    await state.tasks[0].handler();

    expect(state.tasks[0].destroyed).toBe(true);
    expect(cronModule.isMailSyncScheduled()).toBe(false);
    expect(state.purged).toBe(0);
  });
});
