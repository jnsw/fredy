/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import logger from '../logger.js';
import { PAGE_SIZE, searchListings } from './api.js';
import { HONEST, readVerifiedPage } from './poison.js';

/**
 * How many pages one run reads. The search is asked newest first, and a job only cares about what
 * is new since the last run; sixty adverts reach well past that. Each page can cost several
 * requests while its answer is being verified, which is the other reason to stop early.
 */
export const MAX_PAGES = 3;

/**
 * Read the newest adverts of a search, a page at a time, keeping only answers that were verified to
 * carry the real values (see `poison.js`).
 *
 * A page that could not be verified ends the walk. Its adverts are not lost: the job runs again, and
 * the endpoint is asked afresh then.
 *
 * @param {Object} query The structured search query, `platform` included.
 * @param {string} label The portal's name, for the log.
 * @returns {Promise<any[]>} The raw `results[]` entries of every page read.
 */
export async function searchNewest(query, label) {
  const entries = [];
  let maxFrom = Number.POSITIVE_INFINITY;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    // `maxFrom` is the deepest page the search allows, so the walk stops before asking past it.
    if (from > maxFrom) break;

    const body = {
      query,
      sortBy: 'dateCreated',
      sortDirection: 'desc',
      from,
      size: PAGE_SIZE,
      trackTotalHits: true,
      fieldset: 'srp-list',
    };
    const { answer, verdict, attempts } = await readVerifiedPage({
      requestPage: (request) => searchListings(request, label),
      body,
    });
    if (answer == null) break;

    if (verdict.verdict !== HONEST) {
      logger.warn(
        `${label}: page ${page + 1} of the search kept answering rewritten values after ${attempts} attempts ` +
          `(${verdict.reason}). It is left for the next run.`,
      );
      break;
    }

    entries.push(...answer.results);
    if (answer.results.length < PAGE_SIZE) break;
    if (Number.isFinite(Number(answer.maxFrom))) maxFrom = Number(answer.maxFrom);
  }

  return entries;
}
