/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * ImmoScout24.ch, the Swiss portal of Swiss Marketplace Group. It shares nothing with ImmoScout24 in
 * Germany and Austria but the name.
 *
 * The website and the portal's own API host sit behind DataDome, so this reads the SMG API host the
 * Homegate app uses, which serves ImmoScout24.ch's index as well (`lib/services/smg/api.js`), and
 * checks every answer for the rewritten values that host serves at random (`lib/services/smg/poison.js`).
 *
 * The user pastes a search URL from the website, which is translated into the API's structured query:
 *
 *   https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich?nrf=3&nrt=3.5&pt=3000
 *
 * The path is `/{language}/{property type}/{offer type}/{place}`; the place is resolved through the
 * API's own location lookup. The query string carries the filters, translated where the parameter's
 * meaning is known (rooms, living space, price, radius, object types, facilities) and dropped with a
 * warning otherwise, so an unknown filter widens the search rather than stopping it - the way the
 * German ImmoScout provider handles it. Paging (`pn`) and sorting (`o`) are ignored: Fredy reads the
 * newest adverts itself.
 *
 * The parameter names and the code tables for object types (`pty`) and facilities (`an`) were read
 * off the portal's web client by the CappyT/fredy fork.
 */

import { isOneOf } from '../utils.js';
import logger from '../services/logger.js';
import { resolveGeoTag } from '../services/smg/api.js';
import { normalizeSmgListing } from '../services/smg/listing.js';
import { searchNewest } from '../services/smg/search.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.immoscout24.ch/';
const LABEL = 'ImmoScout24.ch';

/** The four languages the portal serves, which a URL may start with. */
const LANGUAGES = new Set(['de', 'fr', 'it', 'en']);

/** The offer type each path word names, and the language the word is written in. */
const OFFER_TYPES = {
  mieten: { offerType: 'RENT', lang: 'de' },
  rent: { offerType: 'RENT', lang: 'en' },
  louer: { offerType: 'RENT', lang: 'fr' },
  affittare: { offerType: 'RENT', lang: 'it' },
  kaufen: { offerType: 'BUY', lang: 'de' },
  buy: { offerType: 'BUY', lang: 'en' },
  acheter: { offerType: 'BUY', lang: 'fr' },
  acquistare: { offerType: 'BUY', lang: 'it' },
};

/**
 * The property type each path word names, as the API spells it. "Immobilien" is the portal's
 * flats-and-houses category, which is what the API's own URL translator makes of it on Homegate.
 * A word not listed here stops the job instead of being dropped, since without it the search would
 * cover another kind of property.
 */
const PROPERTY_TYPES = {
  immobilien: 'APARTMENT_OR_HOUSE',
  'real-estate': 'APARTMENT_OR_HOUSE',
  immobilier: 'APARTMENT_OR_HOUSE',
  immobili: 'APARTMENT_OR_HOUSE',
  wohnung: 'APARTMENT',
  flat: 'APARTMENT',
  apartment: 'APARTMENT',
  appartement: 'APARTMENT',
  appartamento: 'APARTMENT',
  haus: 'HOUSE_OR_CHALET_OR_RUSTICO',
  house: 'HOUSE_OR_CHALET_OR_RUSTICO',
  maison: 'HOUSE_OR_CHALET_OR_RUSTICO',
  casa: 'HOUSE_OR_CHALET_OR_RUSTICO',
};

/** The letter that scales a price in a search URL (`pt=2t` is two thousand francs), and its factor. */
const PRICE_UNITS = { h: 100, t: 1000, g: 10000, f: 100000, m: 1000000 };

/** Query parameters that page and sort rather than filter, which Fredy does itself. */
const IGNORED_PARAMS = new Set(['pn', 'o']);

/** Query parameters that are translated below. */
const TRANSLATED_PARAMS = new Set(['nrf', 'nrt', 'slf', 'slt', 'pf', 'pt', 'r', 'pty', 'an']);

/**
 * The API categories each object type code of `pty` names. A code with no entry is dropped with a
 * warning rather than guessed.
 */
const OBJECT_TYPE_CATEGORIES = new Map([
  [1, ['APARTMENT']],
  [3, ['SINGLE_ROOM']],
  [4, ['ROW_HOUSE']],
  [6, ['ATTIC_FLAT']],
  [7, ['RUSTICO']],
  [8, ['CHALET']],
  [9, ['GARAGE']],
  [21, ['ROOF_FLAT']],
  [24, ['MAISONETTE', 'DUPLEX']],
  [26, ['BUNGALOW', 'SINGLE_HOUSE', 'ENGADINE_HOUSE']],
  [55, ['LOFT']],
  [62, ['FURNISHED_FLAT']],
  [69, ['UNDERGROUND_SLOT']],
  [70, ['OPEN_SLOT']],
  [71, ['COVERED_SLOT']],
  [72, ['DOUBLE_GARAGE']],
  [74, ['HOBBY_ROOM']],
  [98, ['TERRACE_HOUSE']],
  [99, ['TERRACE_FLAT']],
  [103, ['VILLA']],
  [127, ['SINGLE_ROOM']],
  [129, ['GARAGE']],
  [130, ['OPEN_SLOT']],
]);

/**
 * The facilities bitmask `an`: base 32 over this alphabet, read right to left, five bits per
 * character. `an=400` is bit 12, a balcony.
 */
const FACILITY_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUV';

/** The query field each bit of `an` asks for. A bit with no entry is dropped with a warning. */
const FACILITY_FIELDS = new Map([
  [0, 'isWheelchairAccessible'],
  [1, 'arePetsAllowed'],
  [4, 'isNewBuilding'],
  [5, 'isMinergieGeneral'],
  [6, 'isMinergieCertified'],
  [7, 'hasSwimmingPool'],
  [8, 'hasElevator'],
  [9, 'isOldBuilding'],
  [12, 'hasBalcony'],
  [13, 'hasNiceView'],
  [14, 'hasFireplace'],
  [15, 'hasParking'],
  [16, 'hasGarage'],
  [17, 'isChildFriendly'],
  [18, 'hasParkingOrGarage'],
  [19, 'isMinergie'],
]);

/**
 * @param {string|null} raw
 * @returns {number|null} A price in francs, with the unit letter applied.
 */
function readPrice(raw) {
  if (raw == null) return null;
  const match = /^(\d+(?:\.\d+)?)([hftgm])?$/i.exec(raw.trim());
  if (match == null) return null;
  return Number(match[1]) * (match[2] ? PRICE_UNITS[match[2].toLowerCase()] : 1);
}

/**
 * @param {string|null} raw
 * @returns {number|null}
 */
function readNumber(raw) {
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {number|null} from
 * @param {number|null} to
 * @returns {{from?: number, to?: number}|null} Only the bounds that were given, or null for none.
 */
function range(from, to) {
  if (from == null && to == null) return null;
  return { ...(from == null ? {} : { from }), ...(to == null ? {} : { to }) };
}

/**
 * @param {string} segment
 * @returns {string}
 */
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * The search a pasted URL describes.
 *
 * @typedef {Object} Is24Search
 * @property {string} lang The language of the URL, which the place lookup is asked in.
 * @property {string|null} location The place slug (`ort-zuerich`), or null for all of Switzerland.
 * @property {number|null} radius The radius around the place, in metres.
 * @property {Object} query The structured query without the place.
 * @property {string[]} dropped The filters that were not translated, for the log.
 */

/**
 * Translate a pasted ImmoScout24.ch search URL.
 *
 * @param {string} url
 * @returns {{search: Is24Search|null, problem: string|null}} `problem` says why the URL cannot be
 *   searched when `search` is null.
 */
export function parseSearchUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { search: null, problem: 'it is not a URL' };
  }

  const segments = parsed.pathname
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeSegment(segment).toLowerCase());
  const prefix = LANGUAGES.has(segments[0]) ? segments.shift() : null;

  const offerAt = segments.findIndex((segment) => OFFER_TYPES[segment] != null);
  if (offerAt === -1) {
    return { search: null, problem: 'the path names no offer type (mieten, kaufen, ...)' };
  }
  const offer = OFFER_TYPES[segments[offerAt]];
  if (offerAt === 0) {
    return { search: null, problem: 'the path names no property type (wohnung, haus, immobilien, ...)' };
  }
  if (offerAt !== 1 || PROPERTY_TYPES[segments[0]] == null) {
    return { search: null, problem: `the property type "${segments.slice(0, offerAt).join('/')}" is not supported` };
  }
  const rest = segments.slice(offerAt + 1);
  if (rest.length > 1) {
    return { search: null, problem: `the path "/${rest.join('/')}" after the offer type cannot be read` };
  }

  const params = parsed.searchParams;
  const query = { offerType: offer.offerType, propertyType: PROPERTY_TYPES[segments[0]] };
  const dropped = [];

  const rooms = range(readNumber(params.get('nrf')), readNumber(params.get('nrt')));
  if (rooms != null) query.numberOfRooms = rooms;
  const livingSpace = range(readNumber(params.get('slf')), readNumber(params.get('slt')));
  if (livingSpace != null) query.livingSpace = livingSpace;
  const price = range(readPrice(params.get('pf')), readPrice(params.get('pt')));
  if (price != null) query[offer.offerType === 'BUY' ? 'purchasePrice' : 'monthlyRent'] = price;

  const codes = (params.get('pty') ?? '').split(',').filter((code) => code.trim() !== '');
  const categories = new Set();
  for (const code of codes) {
    const names = OBJECT_TYPE_CATEGORIES.get(Number.parseInt(code, 10));
    if (names == null) dropped.push(`pty=${code}`);
    else names.forEach((name) => categories.add(name));
  }
  if (categories.size > 0) {
    // The API refuses a query naming both; the object types are the narrower of the two.
    delete query.propertyType;
    query.categories = [...categories];
  }

  const facilities = (params.get('an') ?? '').toUpperCase();
  if (facilities.length > 0) {
    if ([...facilities].some((character) => !FACILITY_ALPHABET.includes(character))) {
      dropped.push(`an=${facilities}`);
    } else {
      [...facilities].reverse().forEach((character, position) => {
        const bits = FACILITY_ALPHABET.indexOf(character);
        for (let bit = 0; bit < 5; bit++) {
          if ((bits & (1 << bit)) === 0) continue;
          const field = FACILITY_FIELDS.get(position * 5 + bit);
          if (field == null) dropped.push(`an bit ${position * 5 + bit}`);
          else query[field] = true;
        }
      });
    }
  }

  for (const name of new Set(params.keys())) {
    if (!TRANSLATED_PARAMS.has(name) && !IGNORED_PARAMS.has(name)) dropped.push(name);
  }

  // The site writes a radius under a thousand in kilometres.
  const radius = readNumber(params.get('r'));

  return {
    search: {
      lang: prefix ?? offer.lang,
      location: rest[0] ?? null,
      radius: radius == null || radius <= 0 ? null : radius < 1000 ? radius * 1000 : radius,
      query,
      dropped,
    },
    problem: null,
  };
}

/**
 * @param {string} url The job's search URL.
 * @returns {Promise<Object[]>} The raw search results, newest first.
 */
async function getListings(url) {
  const { search, problem } = parseSearchUrl(url);
  if (search == null) {
    logger.error(`${LABEL}: cannot read the search URL ${url}: ${problem}.`);
    return [];
  }
  if (search.dropped.length > 0) {
    logger.warn(
      `${LABEL}: no translation for ${search.dropped.join(', ')} in ${url}; the search runs wider without it. Please report the search URL.`,
    );
  }

  const query = { ...search.query, platform: 'immoscout24' };
  if (search.location != null) {
    // A place that cannot be resolved ends the run: searching on without it would answer for all of
    // Switzerland on a job that asked for one town.
    const geoTag = await resolveGeoTag({ slug: search.location, lang: search.lang, label: LABEL });
    if (geoTag == null) return [];
    query.location = { geoTags: [geoTag], ...(search.radius != null ? { radius: search.radius } : {}) };
  }

  return searchNewest(query, LABEL);
}

/**
 * The listing's page on the portal. The search answer carries no web address; the shape is the one
 * the SMG portals use for an advert, the offer type and the id. The website cannot be reached from
 * a server to confirm it, so this is the one part of the provider that was not measured.
 *
 * @param {any} listing
 * @returns {string}
 */
const linkOf = (listing) => `${BASE_URL}${listing.offerType === 'BUY' ? 'buy' : 'rent'}/${listing.id}`;

/**
 * @param {any} entry One search result.
 * @returns {ParsedListing}
 */
const normalize = (entry) => normalizeSmgListing(entry, linkOf);

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
  // The sort rides in the request body, newest first.
  sortByDateParam: null,
  // ?pf=1000&pt=2t - both bounds may carry a unit letter, so they are read rather than named.
  priceRangeParams: {
    parse: (url) => {
      const params = new URL(url).searchParams;
      return { min: readPrice(params.get('pf')), max: readPrice(params.get('pt')) };
    },
  },
  getListings,
  normalize,
};

export const metaInformation = {
  countries: ['ch'],
  // Prices are Swiss francs. The price itself stays a plain number in that currency.
  currency: 'CHF',
  name: 'ImmoScout24.ch',
  baseUrl: BASE_URL,
  id: 'immoscout24ch',
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
