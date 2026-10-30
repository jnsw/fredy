/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { bus } from '../events/event-bus.js';
import * as jobStorage from '../storage/jobStorage.js';
import * as userStorage from '../storage/userStorage.js';
import { getUser } from '../storage/userStorage.js';
import { duringWorkingHoursOrNotSet } from '../../utils.js';
import FredyPipelineExecutioner from '../../FredyPipelineExecutioner.js';
import * as similarityCache from '../similarity-check/similarityCache.js';
import { isRunning, markFinished, markRunning } from './run-state.js';
import { sendToUsers } from '../sse/sse-broker.js';
import * as puppeteerExtractor from '../extractor/puppeteerExtractor.js';
import { getSettings } from '../storage/settingsStorage.js';
import { renewProxySession } from '../proxy/portalProxy.js';
import { isDemoJob } from '../demo/demoService.js';
import { isTourJob } from '../tour/tourService.js';
import { runConnectivity } from '../crons/connectivity-cron.js';
import { globalIntervalMinutes, jitterPercent, ownIntervalMinutes, plannedRunAt } from './jobInterval.js';

/**
 * How often the scheduler looks for work it was not already waiting for: a job with an interval of
 * its own that has fallen due, an interval edited in the form, a job switched on. Polled rather than
 * told, because jobs change through the form, the status switch, the MCP interview, the demo and the
 * tour, and an event every one of them had to remember would be one forgotten the next time. A look
 * is one small query on the jobs table.
 * @type {number}
 */
const SCHEDULER_CHECK_MS = 60_000;

/**
 * Where a job stands between two runs: when the previous run ended, and the random draw that decides
 * how much of the configured delay the next one waits.
 * @typedef {{anchor: number, fraction: number}} RunCycle
 */

/**
 * Start a cycle, drawing its random delay once. See `plannedRunAt` for why it is kept.
 *
 * @param {number} [anchor=Date.now()]
 * @returns {RunCycle}
 */
function newCycle(anchor = Date.now()) {
  return { anchor, fraction: Math.random() };
}

/**
 * Initializes the job execution service.
 * - Registers event-bus listeners for `jobs:runAll`, `jobs:runOne`, and `jobs:status`.
 * - Performs an initial run of every job, respecting working hours, then starts the scheduler (if
 *   `intervalMs` > 0).
 * - Forwards job status updates to affected users via Server-Sent Events (SSE).
 *
 * The scheduler runs two kinds of job, one after another and never side by side:
 * - Jobs without an interval of their own run together as one batch, as every job always did. The
 *   next batch is due one global interval (read live from the `interval` setting) after the previous
 *   one ended.
 * - A job with an interval of its own runs alone, one of its intervals after its previous run ended -
 *   whichever way that run was started, so a run started by hand is not followed by a scheduled one a
 *   minute later.
 *
 * Either way the run waits a further random share of the interval, up to `intervalJitterPercent`
 * (zero unless an admin sets it), so the portals do not see requests on a fixed beat. Working hours
 * apply to both, and two runs of one job never overlap: the run-state guard skips a job that is
 * still running.
 *
 * This function is intentionally side-effectful and exposes no external API.
 *
 * @param {Object} deps - Dependencies required to initialize the service.
 * @param {Array<Object>} deps.providers - Loaded provider modules. Each module must expose `metaInformation.id` and `createConfig(sourceConfig, blacklist)`, which returns a fresh, run-scoped provider config.
 * @param {number} deps.intervalMs - The global interval at startup, in milliseconds. Only a fallback for when the live `interval` setting cannot be read as a number. If not finite or <= 0, the scheduler is not started.
 * @returns {void}
 */
export function initJobExecutionService({ providers, intervalMs }) {
  /**
   * The cycle of every job that has run since startup, keyed by job id. Consulted only for jobs
   * with an interval of their own; the scheduler forgets the rest on its next look.
   * @type {Map<string, RunCycle>}
   */
  const jobCycles = new Map();

  // Forward job status via SSE to relevant recipients
  bus.on('jobs:status', ({ jobId, running }) => {
    try {
      const recipients = resolveRecipients(jobId);
      if (recipients.length > 0) {
        sendToUsers(recipients, 'jobStatus', { jobId, running });
      }
    } catch (err) {
      logger.warn('Failed to forward job status', jobId, err);
    }
  });

  // Listen for "run all" requests (admin = all, user = own)
  bus.on('jobs:runAll', (payload) => {
    const userId = payload?.userId ?? null;
    const user = userId ? getUser(userId) : null;
    const isAdmin = !!user?.isAdmin;
    if (isAdmin) {
      logger.debug('Running all jobs manually (admin request)');
    } else if (userId) {
      logger.debug(`Running all jobs manually for user ${userId}`);
    } else {
      logger.debug('Running all jobs manually (no user provided)');
    }
    runAll(false, { userId, isAdmin });
  });

  // Listen for single job run requests
  bus.on('jobs:runOne', ({ jobId }) => {
    logger.debug(`Running single job manually: ${jobId}`);
    // fire and forget, do not block the bus
    runSingle(jobId);
  });

  // start once at startup, respecting working hours
  const startupRun = runAll(true);

  // Self-rescheduling rather than a fixed setInterval, so changing the interval in the settings UI
  // takes effect on the next look instead of requiring a restart. Every interval is read live.
  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    const fallbackMinutes = intervalMs / 60_000;
    // Counted from startup, so the first batch comes one interval after it, as it always did.
    /** @type {RunCycle} */
    let batchCycle = newCycle();

    /** @param {Record<string, any>} liveSettings */
    const batchDueAt = (liveSettings) =>
      plannedRunAt(
        batchCycle.anchor,
        globalIntervalMinutes(liveSettings, fallbackMinutes) * 60_000,
        jitterPercent(liveSettings),
        batchCycle.fraction,
      );

    const tick = async () => {
      let delay = SCHEDULER_CHECK_MS;
      try {
        if (Date.now() >= batchDueAt(await getSettings())) {
          try {
            await runAll(true, undefined, (job) => ownIntervalMinutes(job) == null);
          } finally {
            // Restarted even when the batch failed or was skipped for working hours, so the next
            // attempt is an interval away, as it always was, rather than a minute.
            batchCycle = newCycle();
          }
        }
        await runDueJobs();
        // Woken exactly when the batch is due, and at least once a minute for everything else.
        delay = Math.min(SCHEDULER_CHECK_MS, Math.max(0, batchDueAt(await getSettings()) - Date.now()));
      } catch (err) {
        logger.error('Scheduled run failed', err);
      }
      const timer = setTimeout(tick, delay);
      // Do not hold the process open just for the next scan.
      timer.unref?.();
    };

    // The first look waits for the startup run, so the scheduler never runs a job beside it.
    startupRun.catch((err) => logger.error('Startup run failed', err)).finally(() => setTimeout(tick, 0).unref?.());
  }

  /**
   * Resolve all recipients who should receive SSE updates for a job.
   * Includes job owner, users with whom the job is shared, and all admins.
   *
   * @param {string} jobId
   * @returns {string[]} unique userIds
   */
  function resolveRecipients(jobId) {
    const job = jobStorage.getJob(jobId);
    if (!job) return [];
    const admins = (userStorage.getUsers && userStorage.getUsers()) || [];
    const adminIds = admins.filter((u) => u.isAdmin).map((u) => u.id);
    const shared = Array.isArray(job.shared_with_user) ? job.shared_with_user : [];
    const recipients = [job.userId, ...shared, ...adminIds].filter(Boolean);
    return Array.from(new Set(recipients));
  }

  /**
   * Whether a run that was not asked for by naming this one job may include it.
   *
   * @param {{id: string, userId?: string}} job
   * @param {Record<string, any>} liveSettings
   * @param {{userId?: string, isAdmin?: boolean}} [context] - Who requested the run.
   * @returns {boolean}
   */
  function mayRun(job, liveSettings, context = undefined) {
    // The onboarding tour's example job is stored disabled, but a user can switch it on from the
    // overview. It must still never search: its listings are invented and it vanishes on its own.
    if (isTourJob(job.id)) return false;
    // A demo instance runs exactly one job, no matter who asked. Anything a visitor created
    // stays inert and is removed again by the hourly demo cleanup.
    if (liveSettings.demoMode) return isDemoJob(job.id);
    if (!context) return true; // startup/cron → all
    if (context.isAdmin) return true; // admin → all
    return context.userId ? job.userId === context.userId : false; // user → own
  }

  /**
   * Execute all enabled jobs, optionally filtering by context (admin/owner) and respecting working hours.
   *
   * @param {boolean} [respectWorkingHours=true] - If true, skip execution when outside configured working hours.
   * @param {{userId?: string, isAdmin?: boolean}} [context] - Who requested the run; determines job filtering.
   * @param {(job: Object) => boolean} [include] - Narrows the run further; the scheduled batch uses it
   *   to leave out the jobs that keep an interval of their own.
   * @returns {Promise<void>}
   */
  async function runAll(respectWorkingHours = true, context = undefined, include = () => true) {
    const now = Date.now();
    // Read live rather than from the object handed in at startup, so working hours and demo mode
    // follow the settings UI without a restart.
    const liveSettings = await getSettings();
    const withinHours = duringWorkingHoursOrNotSet(liveSettings, now);
    if (respectWorkingHours && !withinHours) {
      logger.debug('Working hours set. Skipping as outside of working hours.');
      return;
    }
    const jobs = jobStorage.getJobs().filter((job) => mayRun(job, liveSettings, context) && include(job));

    for (const job of jobs) {
      await executeJob(job);
    }
  }

  /**
   * Run every job with an interval of its own whose next run has come, one after another.
   *
   * Outside working hours nothing runs and nothing is lost: a job that fell due stays due and runs
   * at the first look inside the window.
   *
   * @returns {Promise<void>}
   */
  async function runDueJobs() {
    const liveSettings = await getSettings();
    if (!duringWorkingHoursOrNotSet(liveSettings, Date.now())) return;
    const percent = jitterPercent(liveSettings);
    const scheduled = jobStorage.getJobsWithOwnInterval();

    // A job switched off, deleted or put back on the global interval has no use for its cycle. Should
    // it come back, its stored last run says where it stands.
    const ids = new Set(scheduled.map((entry) => entry.id));
    for (const id of jobCycles.keys()) {
      if (!ids.has(id)) jobCycles.delete(id);
    }

    for (const entry of scheduled) {
      const minutes = ownIntervalMinutes(entry);
      // A job in the middle of a run - started by hand, most likely - starts its cycle when it ends.
      if (minutes == null || isRunning(entry.id)) continue;
      const cycle = cycleOf(entry);
      if (Date.now() < plannedRunAt(cycle.anchor, minutes * 60_000, percent, cycle.fraction)) continue;
      const job = jobStorage.getJob(entry.id);
      if (job == null || !job.enabled || !mayRun(job, liveSettings)) continue;
      await executeJob(job);
    }
  }

  /**
   * The cycle a job with an interval of its own is in, starting one on first sight.
   *
   * A job that has not run since startup is counted from its last run before that, when it had one.
   * One that has never run at all is counted from now: a job saved a minute ago searches one interval
   * later - the same promise the MCP interview makes - rather than straight away.
   *
   * @param {{id: string, lastRunAt: number|null}} entry
   * @returns {RunCycle}
   */
  function cycleOf(entry) {
    let cycle = jobCycles.get(entry.id);
    if (cycle == null) {
      cycle = newCycle(typeof entry.lastRunAt === 'number' ? entry.lastRunAt : Date.now());
      jobCycles.set(entry.id, cycle);
    }
    return cycle;
  }

  /**
   * Execute a single job by id.
   * Manual runs are allowed even if the job is disabled, but never duplicated when already running.
   *
   * @param {string} jobId
   * @returns {Promise<void>}
   */
  async function runSingle(jobId) {
    const liveSettings = await getSettings();
    if (liveSettings.demoMode && !isDemoJob(jobId)) return;
    // Manual runs ignore the enabled flag, so the tour's example job needs refusing here as well.
    if (isTourJob(jobId)) return;
    const job = jobStorage.getJob(jobId);
    if (!job) return;
    // allow manual run even if disabled; keep guard to avoid duplicates
    await executeJob(job);
  }

  /**
   * Executes one job across all of its configured providers.
   * Emits SSE start/finish events via the bus and ensures the run-state guard is always cleared.
   * Provider errors are surfaced via logging but do not abort other providers.
   *
   * @param {Object} job
   * @param {string} job.id
   * @param {Array<{id:string}>} job.provider
   * @param {Array<string>} [job.blacklist]
   * @param {*} job.notificationAdapter
   * @returns {Promise<void>}
   */
  async function executeJob(job) {
    if (isRunning(job.id)) {
      logger.debug(`Job ${job.id} is already running. Skipping.`);
      return;
    }
    const acquired = markRunning(job.id);
    if (!acquired) return;
    // Persist the trigger time so the dashboard "last search" KPI can be
    // derived per accessible user without an in-memory cache.
    try {
      jobStorage.updateJobLastRunAt(job.id, Date.now());
    } catch (err) {
      logger.warn('Failed to persist last_run_at for job', job.id, err);
    }
    // notify listeners (SSE) that the job started
    try {
      bus.emit('jobs:status', { jobId: job.id, running: true });
    } catch (err) {
      logger.warn('Failed to emit start status for job', job.id, err);
    }
    let browser;
    try {
      // Read the proxy live (not from the startup snapshot) so changing it in the
      // UI takes effect on the next run without a backend restart. An empty value
      // disables the proxy. Routing the headless browser through a (German
      // residential) proxy avoids datacenter-IP based bot detection on the
      // Puppeteer-based providers (immowelt, immonet, kleinanzeigen, ...).
      const liveSettings = await getSettings();
      const proxyUrl = typeof liveSettings?.proxyUrl === 'string' ? liveSettings.proxyUrl.trim() : '';
      // The providers that ask their portal without the browser go through the same proxy (see
      // portalProxy.js). A `{session}` in its url gets a new id here, so every run leaves from an
      // address of its own; the browser below gets its own one when it is launched.
      renewProxySession();

      const jobProviders = job.provider.filter(
        (p) => providers.find((loaded) => loaded.metaInformation.id === p.id) != null,
      );
      for (const prov of jobProviders) {
        try {
          const matchedProvider = providers.find((loaded) => loaded.metaInformation.id === prov.id);
          // A fresh config per run. The provider modules used to keep the URL and the blacklist in
          // module scope, so a second job starting while this one was mid-flight overwrote them and
          // its listings were stored under the wrong job.
          const providerConfig = matchedProvider.createConfig({ ...prov, userId: job.userId }, job.blacklist);

          if (browser && !browser.connected) {
            logger.debug('Browser is disconnected, nullifying to launch a new one.');
            await puppeteerExtractor.closeBrowser(browser);
            browser = null;
          }

          if (!browser) {
            browser = await puppeteerExtractor.launchBrowser(providerConfig.url, proxyUrl ? { proxyUrl } : {});
          }

          await new FredyPipelineExecutioner(providerConfig, job, prov.id, similarityCache, browser).execute();
        } catch (err) {
          logger.error(err);
        }
      }
    } finally {
      if (browser) {
        await puppeteerExtractor.closeBrowser(browser);
      }
      // Whichever way it was started, a finished run is what the next one is counted from.
      jobCycles.set(job.id, newCycle());
      markFinished(job.id);
      try {
        bus.emit('jobs:status', { jobId: job.id, running: false });
      } catch (err) {
        logger.warn('Failed to emit finish status for job', job.id, err);
      }
      // A run is the only moment listings appear, and it geocodes them as it goes, so this is the
      // earliest point their connectivity can be looked up. Not awaited: the run is finished, and
      // the sweep talks to a throttled outside service that must not hold the job open. Its own
      // guard drops this trigger when a sweep is already under way.
      runConnectivity();
    }
  }
}
