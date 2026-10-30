/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How often a job searches, as the job form and the job list show it.
 *
 * Duplicated from lib/services/jobs/jobInterval.js. The frontend must not import out of lib/ - that
 * code is free to grow a Node built-in and break the Vite build far from the cause - so the bounds
 * and the reading of a stored value are written twice, and test/ui/jobIntervalCopyInSync.test.js is
 * what stops the copies drifting. Drift here would have the form offer an interval the server
 * refuses, or the list show an interval the scheduler does not keep.
 */

/** The shortest interval a job may be given, in minutes. @type {number} */
export const MIN_JOB_INTERVAL_MINUTES = 5;

/** The longest interval a job may be given, in minutes. @type {number} */
export const MAX_JOB_INTERVAL_MINUTES = 1440;

/** The largest random delay, as a share of the interval. @type {number} */
export const MAX_INTERVAL_JITTER_PERCENT = 50;

/**
 * The interval a job carries of its own, in minutes, or null when it follows the global one.
 * Held to the bounds the same way the scheduler holds it.
 *
 * @param {{intervalMinutes?: number|null}|null|undefined} job
 * @returns {number|null}
 */
export function ownIntervalMinutes(job) {
  const minutes = Number(job?.intervalMinutes);
  if (job?.intervalMinutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return Math.min(MAX_JOB_INTERVAL_MINUTES, Math.max(MIN_JOB_INTERVAL_MINUTES, Math.round(minutes)));
}

/**
 * The interval a job actually searches at, and whether it is its own or the global one.
 *
 * @param {{intervalMinutes?: number|null}} job
 * @param {number|string|null|undefined} globalInterval The `interval` setting, in minutes.
 * @returns {{minutes: number|null, own: boolean}} `minutes` is null only while the settings have not
 *   arrived yet.
 */
export function effectiveJobInterval(job, globalInterval) {
  const own = ownIntervalMinutes(job);
  if (own != null) {
    return { minutes: own, own: true };
  }
  const minutes = Number(globalInterval);
  return { minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null, own: false };
}
