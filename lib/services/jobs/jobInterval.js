/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * How often a job searches, and how much that is allowed to wander.
 *
 * Pure, so the scheduler, the job route, the MCP interview and the dashboard all answer the same
 * question the same way, and so the arithmetic can be tested without timers or a database.
 *
 * Two knobs, kept deliberately apart:
 * - A job may carry an interval of its own (`jobs.interval_minutes`). Without one it follows the
 *   global `interval` setting, which is what every job did before the column existed.
 * - The random delay (`intervalJitterPercent`) is one global setting, not one per job. Its purpose
 *   is that the portals do not see Fredy's requests arrive on a fixed beat, and they see the whole
 *   instance from one address - a per-job knob would be a dozen fields guarding one fact.
 *
 * The delay is only ever added, never subtracted, so no run comes earlier than its interval says.
 * That is what keeps the floor below meaningful: the jitter can stretch a five-minute job, it can
 * never squeeze it.
 *
 * `ui/src/services/jobs/jobInterval.js` carries a copy of the bounds for the job form;
 * `test/ui/jobIntervalCopyInSync.test.js` keeps the two from drifting.
 */

/**
 * The shortest interval a job may be given. The same floor the global interval has on the
 * Execution page: searching more often than this is what gets an instance blocked by the portals.
 * @type {number}
 */
export const MIN_JOB_INTERVAL_MINUTES = 5;

/** The longest interval a job may be given: once a day, the same ceiling as the global one. @type {number} */
export const MAX_JOB_INTERVAL_MINUTES = 1440;

/**
 * The largest random delay, as a share of the interval. Half an interval already makes the beat
 * unrecognisable; more would mostly make a job slower than the interval its owner chose.
 * @type {number}
 */
export const MAX_INTERVAL_JITTER_PERCENT = 50;

/**
 * Read a job's own interval as it arrives over the API or the MCP interview.
 *
 * Empty in any spelling (`undefined`, `null`, `''`) means "no interval of its own", which is a
 * valid answer and the default. Anything else has to be a whole number of minutes within the
 * bounds - a value below the floor is refused rather than raised to it, so nobody believes their
 * job searches every minute while it does not.
 *
 * @param {unknown} raw
 * @returns {{value: number|null, error: string|null}}
 */
export function parseJobInterval(raw) {
  if (raw == null || raw === '') {
    return { value: null, error: null };
  }
  // Only a number or its spelling: `Number([15])` and `Number(true)` are numbers too.
  const minutes = typeof raw === 'string' ? Number(raw.trim()) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isInteger(minutes) || minutes < MIN_JOB_INTERVAL_MINUTES || minutes > MAX_JOB_INTERVAL_MINUTES) {
    return {
      value: null,
      error: `intervalMinutes must be a whole number of minutes between ${MIN_JOB_INTERVAL_MINUTES} and ${MAX_JOB_INTERVAL_MINUTES}, or empty to follow the global interval.`,
    };
  }
  return { value: minutes, error: null };
}

/**
 * The interval a job carries of its own, in minutes, or null when it follows the global one.
 *
 * The route only ever stores values within the bounds. A row that holds something else was written
 * by hand, and is held to the bounds here as well, so the floor does not depend on every writer
 * having gone through the route.
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
 * The global interval in minutes, as the settings hold it right now.
 *
 * @param {Record<string, any>|null|undefined} settings
 * @param {number|null} [fallbackMinutes=null] Used when the stored value is not a positive number.
 * @returns {number|null}
 */
export function globalIntervalMinutes(settings, fallbackMinutes = null) {
  const minutes = Number(settings?.interval);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallbackMinutes;
}

/**
 * The configured random delay as a share of the interval, in percent, held to its bounds.
 * Absent - every instance before the setting existed - is zero, which is no delay at all.
 *
 * @param {Record<string, any>|null|undefined} settings
 * @returns {number}
 */
export function jitterPercent(settings) {
  const percent = Number(settings?.intervalJitterPercent);
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  return Math.min(MAX_INTERVAL_JITTER_PERCENT, percent);
}

/**
 * When a run is due, given when the previous one ended.
 *
 * The random draw is a fraction in [0, 1) made once per cycle and kept, not redrawn on every look:
 * a scheduler that rolled again each time it checked would end up running at the first lucky roll,
 * which is early rather than spread out. Kept as a fraction rather than as milliseconds so that an
 * interval or a percentage changed in the meantime applies straight away.
 *
 * @param {number} anchor Epoch ms the previous run ended (or the cycle began).
 * @param {number} intervalMs
 * @param {number} percent From {@link jitterPercent}.
 * @param {number} fraction In [0, 1).
 * @returns {number} Epoch ms.
 */
export function plannedRunAt(anchor, intervalMs, percent, fraction) {
  return anchor + intervalMs + Math.round(intervalMs * (percent / 100) * fraction);
}

/**
 * The latest moment by which the next search of any of these jobs is promised, for the dashboard.
 *
 * Read from what is stored rather than from the scheduler's memory, so it is per user and survives
 * a restart. Jobs on the global interval run together as one batch and are counted from the last of
 * them to start, which is what the dashboard has always shown; a job with an interval of its own is
 * counted from its own last run. The random delay is counted at its maximum: the sidebar turns amber
 * once this moment has passed, and a promise that a delayed run is allowed to overshoot would turn
 * it amber with the scheduler working fine.
 *
 * @param {Array<{lastRunAt?: number|null, intervalMinutes?: number|null}>} jobs The enabled jobs.
 * @param {Record<string, any>} settings
 * @returns {number} Epoch ms, or 0 when none of the jobs has run yet.
 */
export function latestNextRunAt(jobs, settings) {
  const percent = jitterPercent(settings);
  const promise = (anchor, minutes) => plannedRunAt(anchor, minutes * 60_000, percent, 1);

  let batchAnchor = null;
  const candidates = [];
  for (const job of jobs ?? []) {
    if (typeof job?.lastRunAt !== 'number') continue;
    const own = ownIntervalMinutes(job);
    if (own != null) {
      candidates.push(promise(job.lastRunAt, own));
    } else if (batchAnchor == null || job.lastRunAt > batchAnchor) {
      batchAnchor = job.lastRunAt;
    }
  }
  const globalMinutes = globalIntervalMinutes(settings);
  if (batchAnchor != null && globalMinutes != null) {
    candidates.push(promise(batchAnchor, globalMinutes));
  }
  return candidates.length > 0 ? Math.min(...candidates) : 0;
}
