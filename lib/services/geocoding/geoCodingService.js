/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getGeocoordinatesByAddress } from '../storage/listingsStorage.js';
import { geocode as nominatimGeocode, isPaused as isNominatimPaused } from './client/nominatimClient.js';
import { extractPostcode } from './postcode.js';
import { DEFAULT_COUNTRIES } from '../providers/countries.js';
import { getProviderIdsForCountries } from '../providers/providerCountries.js';
import logger from '../logger.js';

/**
 * Coordinates Nominatim returned for an address with a postcode, after checking the postcode.
 *
 * Keyed by the countries and the address. Lives in memory only; see {@link geocodeAddress} for why
 * the database cannot serve these addresses.
 * @type {Map<string, {lat: number, lng: number}>}
 */
const validatedCoordinates = new Map();

/** Most addresses kept in {@link validatedCoordinates}; the oldest entry goes first. */
const MAX_VALIDATED_COORDINATES = 1000;

/**
 * Remember coordinates whose postcode was checked.
 *
 * @param {string} key
 * @param {{lat: number, lng: number}} coordinates
 * @returns {void}
 */
function rememberValidated(key, coordinates) {
  validatedCoordinates.set(key, coordinates);
  if (validatedCoordinates.size > MAX_VALIDATED_COORDINATES) {
    validatedCoordinates.delete(validatedCoordinates.keys().next().value);
  }
}

/**
 * An address with a trailing parenthesis removed, or null when there is nothing to remove.
 *
 * Kleinanzeigen writes how far a listing is from the searched point into the address, so what
 * reaches the geocoder is `40217 Unterbilk (0.6 km)`. Nominatim treats the distance as part of the
 * place name and answers "no such place", which is not an error: the listing is stored without
 * coordinates, so no area filter can judge it and no travel time is computed.
 *
 * Only the last parenthesis, only at the end, and only if something is left. Anything a portal puts
 * after the address is the portal talking about the listing rather than naming the place.
 *
 * @param {string} address
 * @returns {string|null}
 */
function withoutTrailingParenthesis(address) {
  const trimmed = address.replace(/\s*\([^()]*\)\s*$/, '').trim();
  return trimmed.length > 0 && trimmed !== address.trim() ? trimmed : null;
}

/**
 * Geocodes an address using Nominatim or cached results from the database.
 *
 * When the address names a postcode, the Nominatim client only accepts a result in that postcode, so
 * a district name that exists in several cities can no longer land the listing in the wrong one.
 * Such an address does not use the database cache: rows geocoded before the postcode was checked
 * cannot show which postcode their coordinates are in, and one wrong row would otherwise hand its
 * coordinates to every later listing with the same address. Checked results are kept in memory
 * instead, so a run with many listings at the same address still asks only once.
 *
 * @param {string} address - The address to geocode.
 * @param {string[]} [countries] - ISO 3166-1 alpha-2 codes to search in. Defaults to Germany, which
 *   is what every provider that declares nothing resolves to.
 * @returns {Promise<{lat: number, lng: number}|null>} The geocoordinates or null if error. {lat: -1, lng: -1} if not found.
 */
export async function geocodeAddress(address, countries = DEFAULT_COUNTRIES) {
  if (!address) {
    return null;
  }

  try {
    const postcode = extractPostcode(address, countries);
    const scope = Array.isArray(countries) && countries.length > 0 ? countries : DEFAULT_COUNTRIES;
    const validatedKey = `${[...scope].sort().join(',')}|${address}`;

    // 1. Check if we already know this address. Scoped to the countries being asked about: the
    // cache matches on the address text alone, so an identically written street in a neighbouring
    // country would otherwise answer for this one.
    if (postcode != null) {
      const validated = validatedCoordinates.get(validatedKey);
      if (validated) {
        logger.debug(`Found validated geocoordinates for address: ${address}`);
        return validated;
      }
    } else {
      const cachedCoordinates = getGeocoordinatesByAddress(address, await getProviderIdsForCountries(countries));
      if (cachedCoordinates) {
        logger.debug(`Found cached geocoordinates for address: ${address}`);
        return cachedCoordinates;
      }
    }

    // 2. If not, use Nominatim, with up to two shorter forms of the address after it.
    //
    // First without whatever the portal appended in brackets, which is the difference between a
    // listing on the map and one that only shows its address. Then the postcode alone: when nothing
    // in the postcode matches the place name - `45659 Stadtmitte` only finds the Stadtmitte of other
    // cities - the middle of the right postcode is a far better position than none.
    //
    // A shorter form is only tried when the answer was "looked, found nothing". A null means the
    // geocoder could not be reached or is standing off after a 429, and asking again would double
    // the requests exactly when Nominatim has said to stop. Never when an answer worked, either:
    // `40211 Stadtmitte (1 km)` resolves to Düsseldorf as written and to Berlin without the
    // distance, there being a Stadtmitte in both. Since `_filterByArea` deletes listings that fall
    // outside the area, replacing a good answer with a wrong one would delete the listing rather
    // than merely misplace its pin.
    const attempts = [address, withoutTrailingParenthesis(address), postcode].filter(
      (attempt, index, all) => attempt != null && all.indexOf(attempt) === index,
    );
    let coordinates = null;
    for (const attempt of attempts) {
      if (attempt !== address) {
        logger.debug(`No coordinates for '${address}'. Trying '${attempt}'.`);
      }
      coordinates = await nominatimGeocode(attempt, countries);
      if (coordinates == null || coordinates.lat !== -1 || coordinates.lng !== -1) {
        break;
      }
    }

    if (postcode != null && coordinates != null && coordinates.lat !== -1 && coordinates.lng !== -1) {
      rememberValidated(validatedKey, coordinates);
    }
    return coordinates;
  } catch (error) {
    logger.error('Error during geocoding:', error);
    return null;
  }
}

/**
 * Checks if we are currently in a rate limit pause.
 * @returns {boolean}
 */
export function isGeocodingPaused() {
  return isNominatimPaused();
}

/**
 * Forget every validated address. For tests only, which would otherwise leak answers between cases.
 *
 * @returns {void}
 */
export function __resetValidatedCoordinates() {
  validatedCoordinates.clear();
}
