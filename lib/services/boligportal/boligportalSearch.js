/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { trackPoi } from '../tracking/Tracker.js';
import { TRACKING_POIS } from '../../TRACKING_POIS.js';

/** How long the navigation to a page may take. */
const NAVIGATION_TIMEOUT = 60_000;

/**
 * How long Cloudflare's challenge may run before the page is given up on.
 *
 * With Fredy's browser it clears in about ten seconds. The margin is generous on purpose: waiting
 * too long costs one slow provider in a job run, waiting too short costs the whole run's listings.
 */
const CHALLENGE_TIMEOUT = 45_000;

/**
 * The element that says the real page has arrived.
 *
 * BoligPortal's pages are a server-rendered app that hydrates from the JSON in this script, so
 * waiting for it is waiting for exactly what the provider reads. A search that matched nothing
 * carries it too, which is what makes it the right marker: waiting for a result card instead would
 * turn "no results today" into a timeout. Cloudflare's interstitial never carries it.
 */
export const STORE_SELECTOR = 'script#store';

/**
 * Load one BoligPortal page - a result page or an advert - waiting out Cloudflare if it steps in.
 *
 * Not the shared extractor, on purpose, and for the same reason idealista has a module like this:
 * Cloudflare answers its challenge with status 403 even when the real page follows a few seconds
 * later, and the extractor takes its bot verdict from that first status, so it would throw away a
 * page that loaded fine. Here the status is only read once the wait has run out.
 *
 * @param {string} url The page to load.
 * @param {any} browser The shared browser of the current job run.
 * @returns {Promise<string|null>} The page source, or null when it never got past the challenge.
 */
export async function fetchSearchHtml(url, browser) {
  const page = await browser.newPage();

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
    if (response?.status?.() === 429) {
      logger.warn('BoligPortal rate limited this run. It stops here.');
      return null;
    }

    try {
      await page.waitForFunction(
        (selector) => document.querySelector(selector) != null,
        { timeout: CHALLENGE_TIMEOUT, polling: 500 },
        STORE_SELECTOR,
      );
    } catch {
      // Only now is the status worth reading. A 403 that resolved into the page is Cloudflare doing
      // its normal thing; a 403 still standing when the wait ran out is the run being refused.
      const status = response?.status?.() ?? 0;
      logger.warn(
        `BoligPortal did not serve the page ${url} (status ${status}). ` +
          'If this keeps happening, the connection is blocked; see the proxy section of doc/providers.md.',
      );
      await trackPoi(`${TRACKING_POIS.DETECTED_AS_BOT}_boligportal`);
      return null;
    }

    return await page.content();
  } catch (error) {
    logger.error(`Error loading the BoligPortal page ${url}:`, error?.message || error);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}
