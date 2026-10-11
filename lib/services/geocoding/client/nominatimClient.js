/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import https from 'https';
import fetch from 'node-fetch';
import pThrottle from 'p-throttle';
import { DEFAULT_COUNTRIES } from '../../providers/countries.js';
import { extractPostcode } from '../postcode.js';
import logger from '../../logger.js';
import { selfHostedUserAgent } from '../../userAgent.js';

const API_URL = 'https://nominatim.openstreetmap.org/search';

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
});

const throttle = pThrottle({
  limit: 1,
  interval: 1000,
});

/**
 * Nominatim requires a specific User-Agent. Shared with the other community APIs Fredy calls, see
 * {@link selfHostedUserAgent}.
 */
const userAgent = selfHostedUserAgent;

/**
 * How long to stand off after Nominatim says no, and why it escalates.
 *
 * A single 429 used to silence every geocode for a full hour, globally. That is the right response
 * to being banned and much too heavy for what actually happens most of the time: one burst over the
 * one-request-per-second policy during a busy job run. Every listing found in that hour then landed
 * with no coordinates and sat there showing "no valid geocoordinates" until the next six-hourly
 * sweep, which is issue #418.
 *
 * So the wait starts at a minute and doubles per consecutive refusal, up to the old hour. A blip
 * costs a minute; a real ban still ends up backing off just as far, it just takes a few tries to
 * get there. Any answer that is not a 429 clears the count, because it proves service is back.
 */
const FIRST_BACKOFF = 60000;
const MAX_BACKOFF = 3600000;

/** Consecutive refusals. Only ever grows the wait; any real answer resets it. */
let consecutiveRefusals = 0;

/** Epoch ms until which no request may be made. */
let backoffUntil = 0;

/**
 * How long to wait after this many consecutive refusals.
 *
 * Exported so the curve can be checked without a clock: the state around it lives behind a
 * throttle, and a test that fast-forwards time deadlocks the throttle's own timer.
 *
 * @param {number} consecutive - Refusals in a row, counting this one. One-based.
 * @returns {number} Milliseconds.
 */
export function backoffFor(consecutive) {
  const steps = Math.max(1, Math.floor(consecutive)) - 1;
  // 2 ** steps overflows into Infinity long before it matters; Math.min still answers MAX_BACKOFF.
  return Math.min(FIRST_BACKOFF * 2 ** steps, MAX_BACKOFF);
}

/**
 * Record a refusal and extend the stand-off.
 *
 * @returns {void}
 */
function noteRateLimit() {
  consecutiveRefusals += 1;
  const wait = backoffFor(consecutiveRefusals);
  backoffUntil = Date.now() + wait;
  logger.warn(`Nominatim rate limit hit (${consecutiveRefusals} in a row). Pausing for ${Math.round(wait / 1000)}s.`);
}

/**
 * Record that Nominatim answered, whatever it answered.
 *
 * Clears the escalation rather than the current wait: reaching here means the wait had already
 * expired, and the next refusal should start from the bottom again.
 *
 * @returns {void}
 */
function noteAnswered() {
  consecutiveRefusals = 0;
}

/**
 * The `countrycodes` value for a set of countries.
 *
 * Nominatim takes a comma separated list, so a search spanning several countries is still one
 * request rather than one per country.
 *
 * @param {string[]} countries - ISO 3166-1 alpha-2 codes.
 * @returns {string} Value for the query parameter.
 */
function countryCodes(countries) {
  const codes = Array.isArray(countries) && countries.length > 0 ? countries : DEFAULT_COUNTRIES;
  return encodeURIComponent(codes.join(','));
}

/**
 * Whether a Nominatim result lies in the given postcode.
 *
 * `address.postcode` is only there because the request asks for `addressdetails`. An area spanning
 * several postcodes lists them separated by `;` or `,`, so the match is on a whole number within it.
 *
 * @param {{address?: {postcode?: string}}} result
 * @param {string} postcode
 * @returns {boolean}
 */
function hasPostcode(result, postcode) {
  return new RegExp(`\\b${postcode}\\b`).test(result?.address?.postcode ?? '');
}

/**
 * Geocodes an address using Nominatim.
 *
 * When the address names a postcode, only a result in that postcode is an answer. Nominatim orders
 * by relevance, and `45659 Stadtmitte` - a district of Recklinghausen - ranks Berlin's Stadtmitte
 * (10117) first; taking that moved the listing across the country and out of any area filter drawn
 * around the right place. A result list with no match is "not found", which lets the caller try a
 * shorter form of the address.
 *
 * @param {string} address - The address to geocode.
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes to search in. Defaults to Germany.
 * @returns {Promise<{lat: number, lng: number}|null>} The geocoordinates or null if error. {lat: -1, lng: -1} if not found.
 */
async function doGeocode(address, countries = DEFAULT_COUNTRIES) {
  if (isPaused()) {
    return null;
  }

  const postcode = extractPostcode(address, countries);
  const url = `${API_URL}?q=${encodeURIComponent(address)}&format=json&addressdetails=1&countrycodes=${countryCodes(countries)}`;

  try {
    const response = await fetch(url, {
      agent,
      timeout: 60000,
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (response.status === 429) {
      noteRateLimit();
      return null;
    }
    noteAnswered();

    if (!response.ok) {
      logger.error(`Nominatim API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      const result = postcode == null ? data[0] : data.find((candidate) => hasPostcode(candidate, postcode));
      if (result) {
        return {
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon),
        };
      }
      logger.debug(`Nominatim found nothing in postcode ${postcode} for '${address}'.`);
    }

    return { lat: -1, lng: -1 };
  } catch (error) {
    logger.error('Error during Nominatim geocoding:', error);
    return null;
  }
}

/**
 * Autocompletes an address using Nominatim.
 *
 * @param {string} query - The search query.
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes to search in. Defaults to Germany.
 * @returns {Promise<string[]>} List of matching addresses.
 */
async function doAutocomplete(query, countries = DEFAULT_COUNTRIES) {
  if (isPaused()) {
    return [];
  }

  const url = `${API_URL}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=${countryCodes(countries)}`;

  try {
    const response = await fetch(url, {
      agent,
      headers: {
        'User-Agent': userAgent,
      },
    });

    if (response.status === 429) {
      noteRateLimit();
      return [];
    }
    noteAnswered();

    if (!response.ok) {
      logger.error(`Nominatim API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (Array.isArray(data)) {
      return data.map((item) => item.display_name);
    }

    return [];
  } catch (error) {
    logger.error('Error during Nominatim autocomplete:', error);
    return [];
  }
}

export const geocode = throttle(doGeocode);

export const autocomplete = throttle(doAutocomplete);

/**
 * Whether Nominatim is currently being left alone.
 *
 * Callers use this to stop early rather than queue up requests that would return nothing: the
 * geocoding sweep breaks out of its loop, and the retry endpoint tells the user to come back later
 * instead of reporting the address as unfindable.
 *
 * @returns {boolean}
 */
export function isPaused() {
  return Date.now() < backoffUntil;
}

/**
 * Forget the current stand-off. For tests only, which would otherwise leak state between cases.
 *
 * @returns {void}
 */
export function __resetRateLimit() {
  consecutiveRefusals = 0;
  backoffUntil = 0;
}

/**
 * The current refusal count. For tests only.
 *
 * @returns {number}
 */
export function __consecutiveRefusals() {
  return consecutiveRefusals;
}

/**
 * End the current wait without touching the escalation. For tests only, which need to make a second
 * request without either sleeping a minute or forgetting how many refusals came before it.
 *
 * @returns {void}
 */
export function __clearBackoff() {
  backoffUntil = 0;
}
