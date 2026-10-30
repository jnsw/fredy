/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import cron from 'node-cron';
import { syncMailAccount } from '../mail/imapSyncService.js';
import {
  countMailAccounts,
  getUserIdsWithEnabledMailAccount,
  purgeExpiredMailMessages,
} from '../storage/mailStorage.js';
import logger from '../logger.js';

/** Every ten minutes. Replies to an application are not a chat; nobody needs them faster. */
export const MAIL_SYNC_CRON = '*/10 * * * *';

/** The scheduled task, or null while no mailbox exists. */
let task = null;

/** Guard against a slow sweep still running when the next slot comes round. */
let running = false;

/**
 * Download new mail for every enabled mailbox, one after the other, and drop messages past their
 * retention period.
 *
 * Once the last mailbox is gone the schedule stops itself, so an instance where everybody removed
 * their mailbox is back to doing nothing on this timer.
 *
 * Never throws: one broken mailbox costs its owner a sync, not everyone else theirs.
 *
 * @returns {Promise<{accounts: number, succeeded: number, failed: number, purged: number, skipped: boolean}>}
 */
export async function runMailSync() {
  if (running) return { accounts: 0, succeeded: 0, failed: 0, purged: 0, skipped: true };
  running = true;
  try {
    if (countMailAccounts() === 0) {
      stopMailSyncCron();
      return { accounts: 0, succeeded: 0, failed: 0, purged: 0, skipped: false };
    }
    const purged = purgeExpiredMailMessages();
    const userIds = getUserIdsWithEnabledMailAccount();
    let succeeded = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        await syncMailAccount(userId);
        succeeded += 1;
      } catch (error) {
        failed += 1;
        // The reason is on the account already, in its public form; the raw one stays in the log.
        logger.warn(`Scheduled mail sync failed for one mailbox: ${error?.message ?? error}`);
      }
    }
    return { accounts: userIds.length, succeeded, failed, purged, skipped: false };
  } catch (error) {
    logger.warn('Scheduled mail sync failed.', error);
    return { accounts: 0, succeeded: 0, failed: 0, purged: 0, skipped: false };
  } finally {
    running = false;
  }
}

/**
 * Start the schedule if it is not running yet. Called on startup when a mailbox exists, and by the
 * API whenever somebody saves one.
 *
 * @returns {void}
 */
export function ensureMailSyncCron() {
  if (task != null) return;
  task = cron.schedule(MAIL_SYNC_CRON, runMailSync);
  logger.info('Mailbox sync scheduled.');
}

/**
 * Stop the schedule.
 *
 * @returns {void}
 */
export function stopMailSyncCron() {
  if (task == null) return;
  task.destroy();
  task = null;
}

/**
 * Whether the schedule is active. For tests and diagnostics.
 *
 * @returns {boolean}
 */
export function isMailSyncScheduled() {
  return task != null;
}

/**
 * Schedule mail sync on startup, but only when somebody has a mailbox. Without one Fredy does not
 * so much as look at the table on a timer.
 *
 * @returns {void}
 */
export function initMailSyncCron() {
  try {
    if (countMailAccounts() > 0) ensureMailSyncCron();
  } catch (error) {
    logger.warn('Could not check for configured mailboxes.', error);
  }
}
