/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading a search over more than its first result page.
 *
 * A run used to read page one and nothing else. With the search sorted by date that holds every
 * listing published since the last run - until more appear in one interval than a page holds, or a
 * job runs for the first time. Everything past the first page was then never seen at all, not
 * filtered, just never fetched.
 *
 * Every further page is another request at a portal that blocks clients asking too much, so the
 * walk is bounded twice: by a page limit the operator sets (`maxResultPages`), and by stopping as
 * soon as reading on cannot turn up anything new. The rules are kept here, once, so that ImmoScout's
 * API and the HTML portals the pipeline reads through its browser stop for the same reasons.
 */

import { sleep } from '../../utils.js';
import logger from '../logger.js';

/**
 * How many result pages one search reads unless the operator chose otherwise.
 *
 * Three rather than one: one is what Fredy did before and is exactly what loses listings on a busy
 * search or a first run. Three rather than more because the walk stops early on its own (see
 * {@link walkResultPages}) and only reaches the limit when a whole page of news arrived since the
 * last run - with the default interval of an hour that is a burst of more than 50 listings on
 * ImmoScout or about 25 on Kleinanzeigen and WG-Gesucht. Three pages cover three times that, while
 * a search can never cost more than three requests per run.
 *
 * @type {number}
 */
export const DEFAULT_MAX_RESULT_PAGES = 3;

/**
 * The most result pages the setting accepts.
 *
 * Ten pages are 500 listings on ImmoScout and 250 on Kleinanzeigen in a single run. A search that
 * wide is better narrowed on the portal than read that deep on every run, and a mistyped value must
 * not turn into a burst of requests that gets the instance blocked.
 *
 * @type {number}
 */
export const MAX_RESULT_PAGES_LIMIT = 10;

/**
 * Pause before every page after the first, plus up to {@link PAGE_JITTER_MS} on top.
 *
 * Bot filters read the pace as well as the client - casa.it walls the third page of a walk that
 * turns them as fast as the browser renders - and identical gaps are a signal of their own.
 *
 * @type {number}
 */
const PAGE_PAUSE_MS = 1_500;

/** @type {number} */
const PAGE_JITTER_MS = 1_500;

/**
 * What one run may read of a search, handed by the pipeline to whoever reads it.
 *
 * Built per run from the operator's setting and from the listings this job has already stored, so
 * nothing about it may outlive the run - which is why it travels as an argument rather than living
 * in the provider module (see "Providers are stateless" in AGENTS.md).
 *
 * @typedef {Object} ResultPageBudget
 * @property {number} maxPages How many result pages may be read, at least one.
 * @property {(raw: any) => boolean} [isKnown] Whether a raw listing, as the provider read it off
 *   the page, is one this job has already stored. Absent means nothing is known.
 * @property {number} [pauseMs] Pause before every page after the first, in milliseconds. Absent
 *   means {@link PAGE_PAUSE_MS} plus jitter. The test suite sets zero.
 */

/**
 * The budget of a caller that names none: the first page, as every search was read before.
 *
 * A provider's `getListings` called outside the pipeline - the fixture download, a test - gets this
 * and behaves exactly as it did before pagination existed.
 *
 * @type {Readonly<ResultPageBudget>}
 */
export const SINGLE_PAGE = Object.freeze({ maxPages: 1 });

/**
 * One result page as a reader hands it to {@link walkResultPages}.
 *
 * @typedef {Object} ResultPage
 * @property {any[]} listings The raw listings on the page, in page order.
 * @property {boolean} [lastPage] True when the page itself says no further page exists. Absent
 *   means it did not say, and the walk goes on until another rule stops it.
 */

/**
 * Read the operator's page limit, falling back to the default and clamping to the allowed range.
 *
 * Lenient on purpose: the settings route already refuses a bad value, so anything odd arriving here
 * is a row written by hand or by an older release, and a search should run rather than fail over it.
 *
 * @param {unknown} value The stored `maxResultPages` setting.
 * @returns {number} An integer between 1 and {@link MAX_RESULT_PAGES_LIMIT}.
 */
export function resolveMaxResultPages(value) {
  if (value == null || value === '') return DEFAULT_MAX_RESULT_PAGES;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return DEFAULT_MAX_RESULT_PAGES;
  return Math.min(Math.max(parsed, 1), MAX_RESULT_PAGES_LIMIT);
}

/**
 * How long to wait before the next page.
 *
 * @param {ResultPageBudget} budget
 * @returns {number} Milliseconds.
 */
function pauseBeforeNextPage(budget) {
  return budget.pauseMs ?? PAGE_PAUSE_MS + Math.random() * PAGE_JITTER_MS;
}

/**
 * Read a search page by page, as far as the budget allows and no further than it is worth.
 *
 * The walk stops after a page that
 * - was the last one by the page's own account (`lastPage`),
 * - brought nothing not already read in this walk - an empty page, or one that repeats an earlier
 *   one, which is what a portal answers past its last page or when it ignores the page parameter,
 * - holds only listings this job has already stored. The search is sorted by date, so the pages
 *   after it are older still and were read by an earlier run. This is the stop that keeps a job in
 *   its steady state at one or two requests a run, whatever the limit,
 * - or was the last one the budget allows.
 *
 * Listings repeated across a page boundary are kept once: a listing published while the walk runs
 * pushes every other one a place down, so the last one on a page turns up again first on the next.
 *
 * A failure on the first page is the caller's own answer and reaches the caller unchanged, exactly
 * as when only one page was read. A failure on any later page ends the walk and keeps everything the
 * pages before it brought in: a page that cannot be read is no reason to throw away the ones that
 * could, and the next run asks again anyway.
 *
 * @param {Object} walk
 * @param {(page: number) => Promise<ResultPage|null>} walk.readPage Reads page `page`, counted from
 *   one. Null means the page could not be read.
 * @param {(raw: any) => unknown} walk.idOf The portal's own id of a raw listing, to recognise one
 *   seen on an earlier page. Listings without one are always kept.
 * @param {ResultPageBudget} [walk.budget] Defaults to {@link SINGLE_PAGE}.
 * @param {string} walk.label Names the search in the log, usually the provider id.
 * @returns {Promise<any[]>} The raw listings of every page read, in page order, without repeats.
 */
export async function walkResultPages({ readPage, idOf, budget = SINGLE_PAGE, label }) {
  const maxPages = Math.max(1, Math.floor(Number(budget?.maxPages) || 1));
  const listings = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    let result;
    if (page === 1) {
      result = await readPage(page);
    } else {
      await sleep(pauseBeforeNextPage(budget));
      try {
        result = await readPage(page);
      } catch (error) {
        logger.warn(
          `${label}: result page ${page} could not be read, keeping the ${listings.length} listing(s) read before it.`,
          error?.message ?? error,
        );
        break;
      }
      if (result == null) {
        logger.warn(
          `${label}: result page ${page} could not be read, keeping the ${listings.length} listing(s) read before it.`,
        );
        break;
      }
    }
    if (result == null) break;

    const onPage = Array.isArray(result.listings) ? result.listings : [];
    let fresh = 0;
    for (const raw of onPage) {
      const id = idOf(raw);
      if (id != null) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      listings.push(raw);
      fresh++;
    }

    if (fresh === 0 || result.lastPage === true) break;

    if (typeof budget.isKnown === 'function' && onPage.every((raw) => budget.isKnown(raw))) {
      logger.debug(`${label}: result page ${page} holds only known listings, not reading further.`);
      break;
    }

    if (page === maxPages) {
      logger.debug(`${label}: stopped after ${maxPages} result page(s), the configured limit.`);
    }
  }

  return listings;
}
