/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * BoligPortal, Denmark's largest rental portal, private landlords included.
 *
 * The site sits behind a Cloudflare challenge that a plain request never clears, so this needs the
 * shared browser; `services/boligportal/boligportalSearch.js` drives it and waits the challenge out.
 *
 * The results are not read off the cards. The page is a server-rendered app that hydrates from one
 * JSON blob, `<script id="store">`, and the whole result list is in it as `props.page_props.results`,
 * with the figures as numbers and the coordinates included. The cards' markup is utility classes
 * that change with every redesign; the data keys are the application's own. The rest of the blob is
 * left alone, in particular `similar_ads` (adverts from elsewhere, shown under the results), which is
 * not the search.
 *
 * The search URL is whatever the site itself browses to. Filters live in both the path and the query:
 *
 *   /lejligheder,rækkehuse,huse/hillerød/5-værelser/?min_size_m2=90&min_rental_period=0
 *   /lejeboliger/hillerød/alle-værelser/?max_monthly_rent=18424&offset=18
 *
 * so a pasted URL is used as it is. The page names its successor in `next_page_url`, which is
 * followed rather than a guess at the `offset` arithmetic.
 *
 * The site's default order is newest first, and choosing it is what removes the `order` parameter;
 * every other sort adds one (`order=RENT_ASC`). So there is no value to send for "newest", and the
 * way to get it is to leave `order` out, which {@link newestFirst} does. The same goes for `offset`:
 * a URL copied from the second page would otherwise skip the first.
 *
 * Prices are the monthly rent as advertised, in Danish kroner. The running costs some landlords
 * charge on top (`monthly_rent_extra_costs`, typically heating and water a conto) become `charges`,
 * with the rent marked as quoted without them.
 */

import * as cheerio from 'cheerio';
import { buildHash, isOneOf, sleep } from '../utils.js';
import { fetchSearchHtml, STORE_SELECTOR } from '../services/boligportal/boligportalSearch.js';
import { publicationDate } from '../utils/publicationDate.js';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.boligportal.dk/';

/**
 * How many result pages one run reads. Each one is a browser navigation through a Cloudflare
 * challenge, so this is a trade: a job that finds more new adverts between two runs than fit on the
 * pages read would miss the oldest of them, while every extra page is more load on a site that looks
 * for automated visitors. Two pages are 36 adverts, well over what a search turns up between runs.
 */
const MAX_PAGES = 2;

/** Pause between two pages of the same run, so they do not arrive back to back. */
const PAGE_DELAY_MS = 2500;
const PAGE_DELAY_JITTER_MS = 2000;

/**
 * The `page_props` of a BoligPortal page: the state its app hydrates from, which is where both the
 * search results and a single advert's own data live.
 *
 * @param {string|null} html The page source.
 * @returns {Object|null} Null when the page carries no readable state.
 */
function readPageProps(html) {
  if (!html) return null;

  const payload = cheerio.load(html)(STORE_SELECTOR).first().text();
  if (!payload) return null;

  try {
    const pageProps = JSON.parse(payload)?.props?.page_props;
    return pageProps != null && typeof pageProps === 'object' ? pageProps : null;
  } catch (error) {
    logger.error('Could not parse the BoligPortal page data.', error?.message || error);
    return null;
  }
}

/**
 * Read the search state out of a BoligPortal page.
 *
 * @param {string|null} html The page source.
 * @returns {{ads: Object[], nextUrl: string|null}|null} Null when the page carried no search state -
 *   a wall, an error page, or a change in how the site delivers its data. An empty result list is not
 *   that: it comes back as `{ads: [], nextUrl: null}`.
 */
export function readSearchPage(html) {
  const pageProps = readPageProps(html);
  if (pageProps == null || !Array.isArray(pageProps.results)) return null;

  const next =
    typeof pageProps.next_page_url === 'string' && pageProps.next_page_url.length > 0 ? pageProps.next_page_url : null;
  try {
    return { ads: pageProps.results, nextUrl: next == null ? null : new URL(next, BASE_URL).href };
  } catch {
    return { ads: pageProps.results, nextUrl: null };
  }
}

/**
 * The search URL as it has to be asked for: no sort of the user's choosing, and from the first page.
 *
 * A search saved "cheapest first" would otherwise come back cheapest first, and only the first pages
 * of it are read - the newest adverts could sit beyond them and never be seen.
 *
 * @param {string} url The job's search URL.
 * @returns {string} The same search without `order` and `offset`; the URL itself when it does not
 *   parse, which the navigation then reports as the failure it is.
 */
export function newestFirst(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('order');
    parsed.searchParams.delete('offset');
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * @param {Object} ad
 * @returns {number} Epoch milliseconds the advert was put up, 0 when the page does not say.
 */
const advertisedAt = (ad) => publicationDate(ad?.advertised_date) ?? publicationDate(ad?.created) ?? 0;

/**
 * Whether an advert is one a person could still answer. The list should only hold live ones; this is
 * for the odd withdrawn entry, and it only rejects what says outright that it is not live.
 *
 * @param {Object} ad
 * @returns {boolean}
 */
function isLive(ad) {
  return ad?.deleted !== true && (ad?.state == null || /^ACTIVE/i.test(String(ad.state)));
}

/**
 * @param {string} url The job's search URL.
 * @param {any} browser The shared browser of the current job run.
 * @returns {Promise<Object[]>} The live adverts of the first `MAX_PAGES` pages, newest first.
 * @throws When the first page could not be had, so a wall or a change in the page is a failed run
 *   rather than a quiet "no listings".
 */
async function getListings(url, browser) {
  /** @type {Map<string, Object>} */
  const adverts = new Map();
  let pageUrl = newestFirst(url);

  for (let page = 0; page < MAX_PAGES && pageUrl != null; page++) {
    const search = readSearchPage(await fetchSearchHtml(pageUrl, browser));

    if (search == null) {
      if (page === 0) {
        throw new Error('BoligPortal did not return a search page - blocked, or its page data has changed.');
      }
      // A later page failing costs only the older adverts; what was read is still worth having.
      logger.warn(`BoligPortal page ${page + 1} of this search could not be read; using the pages before it.`);
      break;
    }

    for (const ad of search.ads) {
      if (ad?.id != null && isLive(ad)) adverts.set(String(ad.id), ad);
    }

    pageUrl = search.nextUrl;
    if (pageUrl != null && page + 1 < MAX_PAGES) {
      await sleep(PAGE_DELAY_MS + Math.random() * PAGE_DELAY_JITTER_MS);
    }
  }

  // Newest first across the pages read, whatever the site does within one.
  return [...adverts.values()].sort((a, b) => advertisedAt(b) - advertisedAt(a));
}

/**
 * @param {unknown} value
 * @returns {number|null} The figure when it is a finite number, else null.
 */
function toNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * "Bakkegade 23, 3400 Hillerød" - a Danish address as it is written. Some landlords hide the street,
 * and then the postcode and town are what is left.
 *
 * @param {Object} ad
 * @returns {string|null}
 */
function buildAddress(ad) {
  const present = (part) => part != null && String(part).trim() !== '';
  const street = [ad.street_name, ad.street_number].filter(present).join(' ');
  const town = [ad.postal_code, ad.city].filter(present).join(' ');
  const full = [street, town].filter((part) => part.length > 0).join(', ');
  return full.length > 0 ? full : null;
}

/**
 * The first picture that is a photo. A floor plan is often the first image of a flat, and as a
 * thumbnail it says nothing about the place.
 *
 * @param {Object} ad
 * @returns {string|null}
 */
function pickImage(ad) {
  const images = Array.isArray(ad.images) ? ad.images : [];
  return (
    (images.find((image) => image?.url && !image.is_floor_plan) ?? images.find((image) => image?.url))?.url ?? null
  );
}

/**
 * What the rent is: without the running costs where the advert states some on top of it. An advert
 * that states none makes no claim either way, so nothing is said about it.
 *
 * @param {Object} ad
 * @returns {{chargesIncluded?: boolean, charges?: number}}
 */
function rentBasis(ad) {
  const extra = toNumber(ad.monthly_rent_extra_costs);
  return extra != null && extra > 0 ? { chargesIncluded: false, charges: extra } : {};
}

/**
 * @param {Object} ad One entry of `page_props.results`.
 * @returns {ParsedListing}
 */
function normalize(ad) {
  const price = toNumber(ad.monthly_rent);
  const address = buildAddress(ad);
  const latitude = toNumber(ad.location?.lat);
  const longitude = toNumber(ad.location?.lng);
  const published = advertisedAt(ad);

  return {
    // The price goes into the hash, so a reduction reaches the user as a new listing. As text,
    // because `buildHash` skips anything without a length and a number would be dropped silently.
    id: buildHash(String(ad.id), price == null ? null : String(price)),
    title: ad.title || address,
    link: ad.url ? new URL(ad.url, BASE_URL).href : null,
    price,
    ...(price != null ? rentBasis(ad) : {}),
    size: toNumber(ad.size_m2),
    rooms: toNumber(ad.rooms),
    address,
    description: ad.description || null,
    image: pickImage(ad),
    ...(published > 0 ? { publishedAt: published } : {}),
    // The page's own coordinates, so a listing is placed without a geocoding request - which matters
    // for the ones whose street is hidden and would not geocode to anything useful.
    ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  return (
    o.title != null &&
    !isOneOf(o.title, appliedBlackList) &&
    !isOneOf(o.address, appliedBlackList) &&
    !isOneOf(o.description, appliedBlackList)
  );
}

/** The advert's own id, which its link ends with: `.../23m2-1-vaer-id-5671615`. */
const ADVERT_ID_IN_LINK = /-id-(\d+)(?:[/?#]|$)/;

/** Keys holding other adverts (the results and what is shown under them), never the one asked for. */
const OTHER_ADVERTS_KEYS = new Set(['results', 'similar_ads', 'promoted_ads']);

/**
 * Find one advert's own record inside a page's state.
 *
 * The state of an advert page is not shaped like the search page's, so this looks for the record by
 * what identifies it - an object with the advert's id and a `description` - a few levels down,
 * rather than by a path a redesign would move. Lists of other adverts are skipped: they carry the
 * same fields for a different home.
 *
 * @param {unknown} node
 * @param {string} advertId
 * @param {number} [depth]
 * @returns {Object|null}
 */
function findAdvert(node, advertId, depth = 0) {
  if (node == null || typeof node !== 'object' || depth > 5) return null;

  if (!Array.isArray(node) && String(node.id) === advertId && typeof node.description === 'string') {
    return node;
  }

  for (const [key, child] of Object.entries(node)) {
    if (OTHER_ADVERTS_KEYS.has(key)) continue;
    const found = findAdvert(child, advertId, depth + 1);
    if (found != null) return found;
  }
  return null;
}

/**
 * What an advert page says that the search result may not: the full description, and the address
 * and date where the page has them.
 *
 * @param {string|null} html The advert page source.
 * @param {string} advertId
 * @returns {{description: string|null, address: string|null, publishedAt: number|null}|null} Null
 *   when the page holds no state or no record of this advert.
 */
export function readAdvertDetail(html, advertId) {
  const advert = findAdvert(readPageProps(html), advertId);
  if (advert == null) return null;

  const description = advert.description.replace(/\r\n/g, '\n').trim();
  return {
    description: description.length > 0 ? description : null,
    address: buildAddress(advert),
    publishedAt: advertisedAt(advert) || null,
  };
}

/**
 * Read a listing's own page for the full description.
 *
 * The page is behind the same Cloudflare challenge as the search, so it goes through the same
 * navigation and needs the browser the caller passes in; without one the listing is handed back as
 * it came. Only what the page states is filled in: an empty answer never overwrites the search's.
 *
 * @param {ParsedListing} listing
 * @param {any} browser The shared browser of the current job run.
 * @returns {Promise<ParsedListing>}
 */
async function fetchDetails(listing, browser) {
  const advertId = listing?.link?.match(ADVERT_ID_IN_LINK)?.[1];
  if (advertId == null || browser == null) return listing;

  try {
    const detail = readAdvertDetail(await fetchSearchHtml(listing.link, browser), advertId);
    if (detail == null) {
      logger.warn(`BoligPortal: no advert data on the page of ${listing.id}.`);
      return listing;
    }
    if (detail.description != null) listing.description = detail.description;
    if (detail.address != null) listing.address = detail.address;
    if (detail.publishedAt != null) listing.publishedAt = detail.publishedAt;
  } catch (error) {
    logger.warn(`BoligPortal: could not read the page of ${listing.id}.`, error?.message || error);
  }

  return listing;
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  requiredFieldNames: ['id', 'title', 'link', 'price', 'size', 'rooms', 'address'],
  // The results come from the page's JSON rather than its markup, so there is nothing to crawl.
  crawlContainer: null,
  crawlFields: {},
  // Newest first is the site's default and has no parameter of its own - see the file header.
  sortByDateParam: null,
  priceRangeParams: { min: 'min_monthly_rent', max: 'max_monthly_rent' },
  getListings,
  normalize,
  fetchDetails,
  // Each advert page is a browser navigation through a Cloudflare challenge, so they are spaced out.
  detailFetchDelayMs: 3000,
  detailFetchJitterMs: 2000,
};

export const metaInformation = {
  countries: ['dk'],
  // Rents are Danish kroner. The price itself stays a plain number in that currency.
  currency: 'DKK',
  name: 'BoligPortal',
  baseUrl: BASE_URL,
  id: 'boligportal',
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
