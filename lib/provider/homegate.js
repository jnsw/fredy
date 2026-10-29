/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Homegate, the largest Swiss real estate portal, run by Swiss Marketplace Group like ImmoScout24.ch.
 *
 * The website sits behind DataDome, so this reads the SMG API host the Homegate app itself talks to
 * (`lib/services/smg/api.js`), in Homegate's own index, and checks every answer for the rewritten
 * values that host serves at random (`lib/services/smg/poison.js`) - the same way as ImmoScout24.ch.
 *
 * Unlike ImmoScout24.ch, a pasted search URL needs no translation of Fredy's own: the API translates
 * Homegate URLs itself, for the app's "open this link" feature, so every filter the portal knows is
 * understood exactly as the portal means it. The URL has to be a result page, as copied from the
 * browser: `https://www.homegate.ch/mieten/wohnung/ort-zuerich/trefferliste?ah=3000`.
 */

import { isOneOf } from '../utils.js';
import { translateSearchUrl } from '../services/smg/api.js';
import { normalizeSmgListing } from '../services/smg/listing.js';
import { searchNewest } from '../services/smg/search.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.homegate.ch/';
const LABEL = 'Homegate';

/** The offer type each URL word names, in the language the word is written in. */
const OFFER_WORDS = {
  de: { RENT: 'mieten', BUY: 'kaufen' },
  en: { RENT: 'rent', BUY: 'buy' },
  fr: { RENT: 'louer', BUY: 'acheter' },
  it: { RENT: 'affittare', BUY: 'acquistare' },
};

/** The letter that scales a price in a search URL (`ah=2t` is two thousand francs), and its factor. */
const PRICE_UNITS = { h: 100, t: 1000, g: 10000, f: 100000, m: 1000000 };

/**
 * What the path of a Homegate URL says: its language, and whether it rents or buys. Homegate writes
 * no language prefix, so the offer word is the only sign of the language the user browses in.
 *
 * @param {string|null|undefined} url
 * @returns {{lang: string, offerType: 'RENT'|'BUY'}|null}
 */
function offerOf(url) {
  let segments;
  try {
    segments = new URL(url).pathname.toLowerCase().split('/');
  } catch {
    return null;
  }
  for (const [lang, words] of Object.entries(OFFER_WORDS)) {
    for (const [offerType, word] of Object.entries(words)) {
      if (segments.includes(word)) return { lang, offerType };
    }
  }
  return null;
}

/**
 * @param {string} url The job's search URL.
 * @returns {Promise<Object[]>} The raw search results, newest first.
 */
async function getListings(url) {
  const query = await translateSearchUrl(url, LABEL);
  if (query == null) return [];
  return searchNewest({ ...query, platform: 'homegate' }, LABEL);
}

/**
 * The listing's page, in the language of the search: the offer word and the id, which is the scheme
 * the portal answers on (`/mieten/4003459485`, `/affittare/4003459485`).
 *
 * @param {string} lang
 * @returns {(listing: any) => string}
 */
const linkIn = (lang) => (listing) =>
  `${BASE_URL}${(OFFER_WORDS[lang] ?? OFFER_WORDS.de)[listing.offerType === 'BUY' ? 'BUY' : 'RENT']}/${listing.id}`;

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

/**
 * @param {string|null} raw
 * @returns {number|null}
 */
function readPrice(raw) {
  const match = raw == null ? null : /^(\d+(?:\.\d+)?)([hftgm])?$/i.exec(raw.trim());
  if (match == null) return null;
  return Number(match[1]) * (match[2] ? PRICE_UNITS[match[2].toLowerCase()] : 1);
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  crawlContainer: null,
  crawlFields: {},
  // The sort rides in the request body, newest first.
  sortByDateParam: null,
  // A rent is `ag`/`ah`, a purchase `ai`/`aj`, either with a unit letter (`2t` is 2000).
  priceRangeParams: {
    parse: (url) => {
      const params = new URL(url).searchParams;
      const [min, max] = offerOf(url)?.offerType === 'BUY' ? ['ai', 'aj'] : ['ag', 'ah'];
      return { min: readPrice(params.get(min)), max: readPrice(params.get(max)) };
    },
  },
  getListings,
  normalize: (entry) => normalizeSmgListing(entry, linkIn('de')),
};

export const metaInformation = {
  countries: ['ch'],
  // Prices are Swiss francs. The price itself stays a plain number in that currency.
  currency: 'CHF',
  name: 'Homegate',
  baseUrl: BASE_URL,
  id: 'homegate',
};

/**
 * Build a run-scoped provider configuration. Links are written in the language of the job's URL.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig
 * @param {string[]} [blacklist]
 * @returns {ProviderConfig}
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  normalize: (entry) => normalizeSmgListing(entry, linkIn(offerOf(sourceConfig.url)?.lang ?? 'de')),
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export { config };
