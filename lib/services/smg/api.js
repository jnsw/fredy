/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The listing API of Swiss Marketplace Group (SMG), which runs both ImmoScout24.ch and Homegate.
 *
 * Both portals' websites sit behind DataDome, and so do their per-portal API hosts
 * (`api.immoscout24.ch`, `api.homegate.ch`): asked without a DataDome cookie they answer 403 with a
 * captcha. The host the Homegate app itself talks to, `api.re.swissmarketplace.group`, answers the
 * same API to a plain request, and it serves both portals: a search names the portal whose index it
 * runs in with `query.platform` (`homegate` or `immoscout24`), and the two indexes differ - each holds
 * adverts the other does not. Nothing is solved, spoofed or signed to get there; the requests carry
 * no app identity at all, because the answers were measured to be the same without one.
 *
 * What the host does to a client it does not trust is rewrite its answers: see `poison.js`, which is
 * why no search goes through here without being checked.
 *
 * The request and response models were documented by the CappyT/fredy fork from the apps.
 */

import logger from '../logger.js';

export const SMG_API = 'https://api.re.swissmarketplace.group';

/** The only page size the search endpoint accepts; anything else is answered 416. */
export const PAGE_SIZE = 20;

/** How many places one location lookup answers with. The default of twenty misses districts. */
const GEO_RESULTS = 100;

/** How long one request may wait. A bare `fetch` has no timeout of its own. */
const REQUEST_TIMEOUT = 15_000;

const HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'de-CH,de;q=0.9',
};

/**
 * Run one page of a structured search.
 *
 * @param {Object} body The request body: `query`, `sortBy`, `sortDirection`, `from`, `size`, ...
 * @param {string} label Who is asking, for the log.
 * @returns {Promise<{results: any[], maxFrom?: number, total?: number}|null>} The answer, or null
 *   when there was none worth reading.
 */
export async function searchListings(body, label) {
  let response;
  try {
    response = await fetch(`${SMG_API}/search/listings`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (error) {
    logger.error(`${label}: the search could not be asked (${error?.message ?? error}).`);
    return null;
  }

  if (!response.ok) {
    // The endpoint names what it refused, and that body is the only place the reason appears.
    const reason = await response.text().catch(() => '');
    logger.error(
      `${label}: the search answered ${response.status} ${response.statusText} ${reason.slice(0, 300)}`.trim(),
    );
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (payload == null || !Array.isArray(payload.results)) {
    logger.error(`${label}: the search answered without a result list.`);
    return null;
  }
  return payload;
}

/**
 * Every name a place is known by in the portals' URLs: Homegate's (`urlNames`) and ImmoScout24's
 * (`is24UrlNames`), in all four languages.
 *
 * @param {any} geoLocation One `results[].geoLocation` of the location lookup.
 * @returns {string[]}
 */
function urlNamesOf(geoLocation) {
  return [...Object.values(geoLocation?.urlNames ?? {}), ...Object.values(geoLocation?.is24UrlNames ?? {})].map(
    (name) => String(name).toLowerCase(),
  );
}

/**
 * The names to ask the autocomplete for. A slug is a kind and a place - `ort-zuerich`,
 * `postcode-8006-zuerich` - and the autocomplete indexes the place, so the slug without its first
 * word is asked first; the whole slug finds the places whose own name has a hyphen.
 *
 * @param {string} slug
 * @returns {string[]}
 */
function candidateNames(slug) {
  const at = slug.indexOf('-');
  return at > 0 ? [slug.slice(at + 1), slug] : [slug];
}

/**
 * Resolve the place a search URL names into the geo tag the search query wants.
 *
 * `GET /geo/locations` is an autocomplete: the answer to "zuerich" holds the city, the canton and
 * dozens of postcodes. Only the entry one of whose URL names is the slug itself is that URL's place,
 * so no other entry is ever taken - a wrong place would search another town and say nothing. The
 * autocomplete answers in the language it is asked in (`zuerich` finds nothing in English), so the
 * URL's language is tried first and German, which the slugs are mostly written in, after it.
 *
 * @param {{slug: string, lang: string, label: string}} place
 * @returns {Promise<string|null>} The geo tag, or null when no place has that slug.
 */
export async function resolveGeoTag({ slug, lang, label }) {
  const wanted = slug.toLowerCase();

  for (const language of [...new Set([lang, 'de'])]) {
    for (const name of candidateNames(wanted)) {
      const url = new URL(`${SMG_API}/geo/locations`);
      url.searchParams.set('lang', language);
      url.searchParams.set('name', name);
      // The answer is ranked, and a district comes after the city and the postcodes it is part of.
      url.searchParams.set('size', String(GEO_RESULTS));

      let answer;
      try {
        const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
        if (!response.ok) {
          logger.error(`${label}: the place lookup answered ${response.status} ${response.statusText}.`);
          return null;
        }
        answer = await response.json();
      } catch (error) {
        logger.error(`${label}: the place lookup could not be asked (${error?.message ?? error}).`);
        return null;
      }

      for (const entry of Array.isArray(answer?.results) ? answer.results : []) {
        const geoLocation = entry?.geoLocation;
        if (urlNamesOf(geoLocation).includes(wanted) && typeof geoLocation.id === 'string') {
          return geoLocation.id;
        }
      }
    }
  }

  logger.error(`${label}: no place is called "${slug}". The search URL may be wrong.`);
  return null;
}
