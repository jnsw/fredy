/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Boligsiden, the Danish portal that gathers the homes for sale of most Danish estate agents (EDC,
 * Nybolig, home, danbolig, ...) into one search.
 *
 * www.boligsiden.dk sits behind a Cloudflare challenge that a plain request never clears, but the
 * site's own frontend reads its results from a separate JSON API, `api.boligsiden.dk`, which answers
 * a plain request. This provider asks that API, the same way Flatfox is read.
 *
 * Two kinds of search URL are accepted:
 *
 * - A result page of the website, which is what a user copies:
 *   `https://www.boligsiden.dk/kommune/koebenhavn/tilsalg/ejerlejlighed?priceMax=3000000`. Its query
 *   string already speaks the API's language (`priceMin`, `priceMax`, `numberOfRoomsMin`, `radius`,
 *   ...), because the website hands it to the API as it is. Only the path has to be translated, and
 *   only the parts whose translation was measured against the API are: a municipality (`kommune`), a
 *   postcode (`postnummer`) and the property types in {@link PROPERTY_TYPES}. A path naming anything
 *   else is refused rather than searched without it, which would answer the whole of Denmark.
 * - A query against the API itself, `https://api.boligsiden.dk/search/cases?zipCodes=5000&...`, which
 *   is passed on untouched. It is the way to search what the translation does not cover.
 *
 * Boligsiden lists homes for sale only. It has no rental search, so the prices are purchase prices.
 */

import { buildHash, isOneOf } from '../utils.js';
import logger from '../services/logger.js';
import { normalizeBuildYear, normalizeEnergyClass } from '../utils/buildingFacts.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.boligsiden.dk/';
const API_HOST = 'api.boligsiden.dk';
const SEARCH_ENDPOINT = `https://${API_HOST}/search/cases`;

/**
 * How many cases one run asks for. The results come newest first, and a job only cares about what is
 * new since the last run. A case is a large record - all of its buildings, earlier sales and agent
 * details come with it - so asking for hundreds would cost megabytes per run for nothing.
 */
const PAGE_SIZE = 50;

/** How long the request may wait. A bare `fetch` has no timeout of its own. */
const REQUEST_TIMEOUT = 20_000;

/**
 * The property types a website path names, and the `addressTypes` value the API wants for each.
 *
 * Only slugs seen in the website's own URLs are listed. An unknown one refuses the search instead of
 * dropping the type, because a search without it would answer every kind of home.
 */
const PROPERTY_TYPES = {
  villa: 'villa',
  raekkehus: 'terraced house',
  ejerlejlighed: 'condo',
  andelsbolig: 'cooperative',
  villalejlighed: 'villa apartment',
};

/** The places a website path can name, and the API parameter each one is searched by. */
const PLACE_KINDS = {
  kommune: 'municipalities',
  postnummer: 'zipCodes',
};

/** The query parameters of a website URL that page and sort its results rather than filter them. */
const PRESENTATION_PARAMS = ['page', 'perPage', 'per_page', 'sortBy', 'sortAscending', 'sortByDistanceCenter'];

/**
 * @param {string} segment One path segment as the URL carries it.
 * @returns {string} The segment decoded, or as it stands when it is not valid percent-encoding.
 */
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Turn a pasted search URL into the query string the API is asked with.
 *
 * @param {string} url The job's search URL, on the website or on the API.
 * @returns {{params: URLSearchParams|null, problem: string|null}} `params` when the URL could be read,
 *   otherwise `problem` says why not.
 */
export function toApiParams(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { params: null, problem: 'it is not a URL' };
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === API_HOST) {
    return { params: new URLSearchParams(parsed.search), problem: null };
  }
  if (host !== 'boligsiden.dk') {
    return { params: null, problem: `${parsed.hostname} is not Boligsiden` };
  }

  const params = new URLSearchParams(parsed.search);
  for (const name of PRESENTATION_PARAMS) {
    params.delete(name);
  }

  const segments = parsed.pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeSegment(segment).toLowerCase());
  const forSale = segments.indexOf('tilsalg');
  if (forSale === -1) {
    return { params: null, problem: 'it is not a result page of homes for sale (no "tilsalg" in the path)' };
  }

  // Before `tilsalg`: pairs of a place kind and its slug. Nothing at all is the whole country.
  const place = segments.slice(0, forSale);
  if (place.length % 2 !== 0) {
    return { params: null, problem: `the place "/${place.join('/')}" cannot be read` };
  }
  for (let index = 0; index < place.length; index += 2) {
    const parameter = PLACE_KINDS[place[index]];
    if (parameter == null) {
      return {
        params: null,
        problem: `places of the kind "${place[index]}" are not supported; search by kommune or postnummer instead`,
      };
    }
    // The API takes several places as a repeated parameter, never as a comma separated one.
    for (const slug of place[index + 1].split(',')) {
      params.append(parameter, slug);
    }
  }

  // After it: the property types. The site writes `/tilsalg/tilsalg/<types>` for the whole country.
  const types = segments.slice(forSale + 1).filter((segment) => segment !== 'tilsalg');
  if (types.length > 1) {
    return { params: null, problem: `the path "/${types.join('/')}" after "tilsalg" cannot be read` };
  }
  if (types.length === 1) {
    const slugs = types[0].split(',');
    const unknown = slugs.filter((slug) => PROPERTY_TYPES[slug] == null);
    if (unknown.length > 0) {
      return { params: null, problem: `the property type "${unknown.join(',')}" is not supported` };
    }
    params.set('addressTypes', slugs.map((slug) => PROPERTY_TYPES[slug]).join(','));
  }

  return { params, problem: null };
}

/**
 * @param {string} url The job's search URL.
 * @returns {Promise<Object[]>} The newest cases of the search.
 */
async function getListings(url) {
  const { params, problem } = toApiParams(url);
  if (params == null) {
    logger.error(
      `Cannot read the Boligsiden search URL ${url}: ${problem}. Paste a result page from boligsiden.dk, or a query on ${SEARCH_ENDPOINT} (see doc/providers.md).`,
    );
    return [];
  }

  // Newest first whatever the URL asked for: `daysListed` ascending is the order of the site's own
  // "Nyeste" sort, and a run only reads the first page of it.
  params.set('sortBy', 'daysListed');
  params.set('sortAscending', 'true');
  params.set('per_page', String(PAGE_SIZE));
  params.set('page', '1');

  const response = await fetch(`${SEARCH_ENDPOINT}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });
  if (!response.ok) {
    logger.error(`Error fetching listings from Boligsiden: ${response.status} ${response.statusText}`);
    return [];
  }

  const body = await response.json();
  return Array.isArray(body?.cases) ? body.cases : [];
}

/**
 * Read one of the API's numbers.
 *
 * Not `extractNumber`: that parser is built for German-formatted text off a page, and the API
 * answers with JSON numbers already.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function toNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The address the way Danish addresses are written, road and number first, then postcode and town.
 *
 * Floor and door are left out: the geocoder places a building, and "3. th" only makes the query
 * harder for it to match.
 *
 * @param {any} address The case's `address`.
 * @returns {string|null}
 */
function buildAddress(address) {
  if (address == null) return null;
  const street = [address.roadName, address.houseNumber].filter((part) => part != null && part !== '').join(' ');
  const town = [address.zipCode, address.cityName].filter((part) => part != null && part !== '').join(' ');
  const full = [street, town].filter((part) => part.length > 0).join(', ');
  return full.length > 0 ? full : null;
}

/**
 * The largest picture the API offers for a case. `imageSources` comes smallest first.
 *
 * @param {any} o
 * @returns {string|null}
 */
function largestImage(o) {
  const sources = o.defaultImage?.imageSources;
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return sources[sources.length - 1]?.url ?? null;
}

/**
 * @param {any} o One case as the API answers it.
 * @returns {ParsedListing}
 */
function normalize(o) {
  const price = toNumber(o.priceCash);
  const latitude = toNumber(o.coordinates?.lat ?? o.address?.coordinates?.lat);
  const longitude = toNumber(o.coordinates?.lon ?? o.address?.coordinates?.lon);

  return {
    // The price goes into the hash, so a reduction reaches the user as a new listing. As text,
    // because `buildHash` skips anything without a length and a number would be dropped silently.
    id: buildHash(o.caseID, price == null ? null : String(price)),
    title: o.descriptionTitle || buildAddress(o.address) || null,
    // `caseUrl` is the listing agent's own page, which every case carries; the address's page on
    // Boligsiden is only the fallback for one that ever comes without it.
    link: o.caseUrl || (o.slug ? `${BASE_URL}adresse/${o.slug}` : null),
    price,
    size: toNumber(o.housingArea),
    rooms: toNumber(o.numberOfRooms),
    address: buildAddress(o.address),
    description: o.descriptionBody ?? null,
    image: largestImage(o),
    buildYear: normalizeBuildYear(o.yearBuilt) ?? undefined,
    energyClass: normalizeEnergyClass(o.energyLabel) ?? undefined,
    // The API places every case itself, so no geocoding request is spent on it.
    ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return o.title != null && titleNotBlacklisted && descNotBlacklisted;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  crawlContainer: null,
  crawlFields: {},
  // getListings sets the newest-first order itself, on either kind of URL.
  sortByDateParam: null,
  // ?priceMin=1000000&priceMax=3000000, the same names on the website and on the API.
  priceRangeParams: { min: 'priceMin', max: 'priceMax' },
  getListings,
  normalize,
};

export const metaInformation = {
  countries: ['dk'],
  // Prices are Danish kroner. The price itself stays a plain number in that currency.
  currency: 'DKK',
  name: 'Boligsiden',
  baseUrl: BASE_URL,
  // The website's result pages are what users paste; a query on the API is accepted as well.
  hosts: ['boligsiden.dk', API_HOST],
  id: 'boligsiden',
};

/**
 * Build a run-scoped provider configuration.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
