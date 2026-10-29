/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The provider config of a portal on the Vonovia group's rental platform.
 *
 * Vonovia and Deutsche Wohnen (a Vonovia company since 2021) publish their flats through one
 * application: the search page fills itself from a JSON list endpoint that returns the same row
 * shape on both sites, that endpoint wants the same short-lived search token, and every detail page
 * embeds the same `data-vonovia-data` record. So their configs are one config over a different site,
 * built here once - the way `buildClassifiedProvider` builds immowelt's and SeLoger's - rather than
 * copied into each provider, where every change to it would have to land twice.
 *
 * What differs is only where things live: the host, the path of the list endpoint, the path detail
 * pages are published under, and the parameters a site's endpoint expects that its search page
 * leaves out.
 *
 * Users paste a search URL from the website, which is translated to the list endpoint:
 * GET /{listPath}?{search parameters}
 *
 * That endpoint only answers a search carrying a short-lived token, which the website fetches from
 * GET /api/real-estate/search-token first and sends as `X-VON-Search-Token`.
 */

import { buildHash, isOneOf } from '../../utils.js';
import logger from '../logger.js';
import { extractNumber } from '../../utils/extract-number.js';
import checkIfListingIsActive from '../listings/listingActiveTester.js';
import puppeteerExtractor from '../extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
/** @import { ParsedListing } from '../../types/listing.js' */
/** @import { ProviderConfig } from '../../types/providerConfig.js' */

/**
 * One site on the platform.
 *
 * @typedef {Object} VonoviaPlatformSite
 * @property {string} id The Fredy provider id. Also names the extractor run of a detail page.
 * @property {string} name Display name, used in log lines.
 * @property {string} baseUrl The site's root, with a trailing slash.
 * @property {string} listPath Path of the list endpoint below `baseUrl`, without a leading slash.
 * @property {string} detailPath Path detail pages are published under, without a leading slash and
 *   with a trailing one; a row's `slug` is appended to it.
 * @property {Object.<string, string>} [defaultParams] Search parameters the endpoint expects and the
 *   website's search page does not always carry. Set only when the pasted URL has no value for them.
 */

/**
 * The largest page the list endpoint is willing to serve.
 *
 * Asking for more is not trimmed down but refused: the endpoint answers `406 Not Acceptable` with
 * an empty body, which reads exactly like being blocked by a bot filter. The Deutsche Wohnen
 * provider used to ask for 100 in one go, so every search broke the day the cap appeared.
 */
const API_MAX_LIMIT = 50;

/**
 * How many pages one run may walk before giving up.
 *
 * A stop condition that depends on the endpoint agreeing with itself - `paging.info.count` against
 * the rows actually returned - is one malformed response away from looping forever. At the cap
 * this still covers 500 listings, far more than any single search returns.
 */
const MAX_PAGES = 10;

/**
 * Where the website fetches the token the list endpoint insists on.
 *
 * A search without one is answered `401 {"error":"Unauthorized"}` - by the application itself, not
 * by a bot filter - which took the Deutsche Wohnen provider out entirely the day the token
 * appeared. It lives fifteen minutes (`ttl: 900`) and names no search, so each run fetches its own
 * rather than keeping one at module scope.
 */
const SEARCH_TOKEN_PATH = 'api/real-estate/search-token';

/** The header the website sends the token in. */
const SEARCH_TOKEN_HEADER = 'X-VON-Search-Token';

/** A desktop browser, which is what the website itself is asked from. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

/**
 * A page size the endpoint accepts, whatever the pasted URL asked for.
 *
 * @param {string|null} requested
 * @returns {string}
 */
function clampLimit(requested) {
  const limit = Number.parseInt(requested ?? '', 10);
  return String(Number.isFinite(limit) && limit > 0 ? Math.min(limit, API_MAX_LIMIT) : API_MAX_LIMIT);
}

/**
 * @param {any} item
 * @returns {string}
 */
function buildAddress(item) {
  const street = item.strasse?.trim();
  const cityLine = [item.plz, item.ort].filter(Boolean).join(' ').trim();
  return [street, cityLine].filter(Boolean).join(', ');
}

/**
 * The endpoint reports an unknown position as 0/0, which is a point in the Atlantic, not a flat.
 *
 * @param {number | null | undefined} value
 * @returns {number | null}
 */
function normalizeCoordinate(value) {
  if (value == null || value === 0) {
    return null;
  }
  return value;
}

/**
 * Builds the description from the embedded detail record.
 *
 * The record also carries the name, e-mail address and phone number of the contact person
 * (`contactFirstname`, `contactSurename`, `contactEmail`, `contactPhone`). Those are deliberately
 * left out: they are personal data Fredy has no use for.
 *
 * @param {any} detailData
 * @returns {string}
 */
function buildDescription(detailData) {
  const parts = [];

  if (detailData.description?.trim()) {
    parts.push(`Beschreibung\n${detailData.description.trim()}`);
  }

  if (detailData.features?.length) {
    parts.push(
      `Ausstattung\n${detailData.features
        .map((f) => String(f).trim())
        .filter(Boolean)
        .join('\n')}`,
    );
  }

  if (detailData.location?.trim()) {
    parts.push(`Lage\n${detailData.location.trim()}`);
  }

  const sectionText = (detailData.sections || [])
    .map((section) => {
      const rows = (section.rows || [])
        .filter((row) => row.label && row.value)
        .map((row) => `${row.label}: ${row.value}`)
        .join('\n');
      if (!rows) return null;
      return [section.heading, rows].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  if (sectionText) {
    parts.push(sectionText);
  }

  if (detailData.miscellaneous?.trim()) {
    parts.push(detailData.miscellaneous.trim());
  }

  return parts.join('\n\n').trim();
}

/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const price = extractNumber(o.price);
  return {
    id,
    link: o.link,
    title: (o.title || '').trim(),
    price: price != null ? Math.round(price) : null,
    size: extractNumber(o.size),
    rooms: extractNumber(o.rooms),
    address: o.address,
    image: o.image,
    description: o.description,
    latitude: normalizeCoordinate(o.latitude),
    longitude: normalizeCoordinate(o.longitude),
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  const titleNotBlacklisted = !isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !isOneOf(o.description, appliedBlackList);
  return titleNotBlacklisted && descNotBlacklisted;
}

/**
 * Reads the price off a detail page.
 *
 * The page embeds the same record the list endpoint returns, so `rent` here is the field behind the
 * list's `preis` (the Kaltmiete). `warmRent` sits right beside it and is the trap: reading it would
 * report an invented increase for every listing of the platform on the first probe.
 *
 * @param {string} html
 * @returns {number|null}
 */
function extractDetailPrice(html) {
  const raw = cheerio.load(html)('[data-vonovia-data]').first().attr('data-vonovia-data');
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.rent ?? data?.purchasePrice ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the provider of one site on the platform.
 *
 * @param {VonoviaPlatformSite} site
 * @returns {{
 *   config: ProviderConfig,
 *   createConfig: (sourceConfig: {url: string, enabled?: boolean}, blacklist?: string[]) => ProviderConfig,
 *   convertWebToApi: (url: string) => string,
 *   fetchSearchToken: (headers: Object.<string, string>) => Promise<string|null>,
 * }}
 */
export function buildVonoviaPlatformProvider(site) {
  const listPathname = `/${site.listPath}`;

  /**
   * Fetch a search token the way the website does before it searches.
   *
   * Answers null rather than failing. The website sends its search without the header when the
   * endpoint gives it nothing, and so does the provider, so it keeps working should the platform
   * drop the requirement again.
   *
   * @param {Object.<string, string>} headers The run's request headers.
   * @returns {Promise<string|null>}
   */
  async function fetchSearchToken(headers) {
    try {
      const response = await fetch(`${site.baseUrl}${SEARCH_TOKEN_PATH}`, { method: 'GET', headers });
      if (!response.ok) {
        logger.error(`Could not obtain a ${site.name} search token:`, response.statusText);
        return null;
      }
      const { token } = await response.json();
      return typeof token === 'string' && token.length > 0 ? token : null;
    } catch (error) {
      logger.error(`Could not obtain a ${site.name} search token:`, error?.message || error);
      return null;
    }
  }

  /**
   * Translates a search page URL of the site into its list endpoint.
   *
   * @param {string} url Web search URL or API URL pasted by the user.
   * @returns {string} API URL used by getListings().
   */
  function convertWebToApi(url) {
    const parsed = new URL(url);

    if (parsed.pathname === listPathname) {
      // An API URL is passed through as pasted, but not its page size: a `limit` over the cap is
      // answered with a 406 and would leave the job with no listings at all.
      parsed.searchParams.set('limit', clampLimit(parsed.searchParams.get('limit')));
      return parsed.toString();
    }

    const params = parsed.searchParams;
    params.delete('scroll');
    params.set('limit', clampLimit(params.get('limit')));

    for (const [key, value] of Object.entries(site.defaultParams ?? {})) {
      if (!params.get(key)) {
        params.set(key, value);
      }
    }

    return `${site.baseUrl}${site.listPath}?${params.toString()}`;
  }

  /**
   * Fetch the listing rows from the list endpoint, walking the pages its size cap leaves behind.
   *
   * Invoked by the pipeline with `this` bound to the executioner, so the run's own configuration -
   * and with it the search URL the user pasted - is reachable via `this._providerConfig`. The
   * referer is read from there rather than from module state, so two jobs running at the same time
   * cannot send each other's referer.
   *
   * @this {{_providerConfig?: {refererUrl?: string|null}}}
   * @param {string} url The API URL to query.
   * @returns {Promise<any[]>}
   */
  async function getListings(url) {
    const refererUrl = this?._providerConfig?.refererUrl ?? null;
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...(refererUrl ? { Referer: refererUrl } : {}),
    };

    const token = await fetchSearchToken(headers);
    const searchHeaders = token ? { ...headers, [SEARCH_TOKEN_HEADER]: token } : headers;

    const pageSize = Number.parseInt(new URL(url).searchParams.get('limit') ?? '', 10) || API_MAX_LIMIT;
    const rows = [];

    // The cap is well below what a city-wide search returns - Berlin alone is over it - so the
    // pages past the first are walked with `offset` rather than left behind. `paging.info.count` is
    // the size of the whole result set, so the first response already says how much is missing.
    for (let page = 0; page < MAX_PAGES; page++) {
      const pageUrl = new URL(url);
      if (page > 0) {
        pageUrl.searchParams.set('offset', String(page * pageSize));
      }

      const response = await fetch(pageUrl.toString(), { method: 'GET', headers: searchHeaders });
      if (!response.ok) {
        logger.error(`Error fetching data from ${site.name} API:`, response.statusText);
        break;
      }

      const responseBody = await response.json();
      const results = responseBody.results || [];
      rows.push(...results);

      const total = responseBody?.paging?.info?.count;
      if (results.length === 0 || total == null || rows.length >= total) {
        break;
      }
    }

    return rows
      .filter((item) => item.vermarktungsart_miete === '1')
      .map((item) => ({
        id: item.wrk_id,
        price: item.preis,
        size: item.groesse,
        rooms: item.anzahl_zimmer,
        title: item.titel,
        link: `${site.baseUrl}${site.detailPath}${item.slug}`,
        address: buildAddress(item),
        image: item.preview_img_url,
        latitude: item.lat,
        longitude: item.lng,
      }));
  }

  /**
   * Reads the embedded detail record for the full description, the street address and, where the
   * list had none, the position.
   *
   * @param {ParsedListing} listing
   * @param {any} [browser]
   * @returns {Promise<ParsedListing>}
   */
  async function fetchDetails(listing, browser) {
    try {
      const html = await puppeteerExtractor(listing.link, 'body', { browser, name: `${site.id}_details` });
      if (!html) return listing;

      const rawData = cheerio.load(html)('[data-vonovia-data]').attr('data-vonovia-data');
      if (!rawData) return listing;

      const detailData = JSON.parse(rawData);
      const description = buildDescription(detailData);
      const address = [detailData.streetAndHouseNumber, detailData.postCodeAndCity].filter(Boolean).join(', ');

      return {
        ...listing,
        address: address || listing.address,
        description: description || listing.description,
        latitude: normalizeCoordinate(detailData.latitude) ?? listing.latitude,
        longitude: normalizeCoordinate(detailData.longitude) ?? listing.longitude,
      };
    } catch (error) {
      logger.warn(`Could not fetch ${site.name} detail page for listing '${listing.id}'.`, error?.message || error);
      return listing;
    }
  }

  /** @type {ProviderConfig} */
  const config = {
    requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
    url: null,
    // The platform's own filter, read off a search with both bounds set:
    // ?priceMin=10&priceMax=1000
    priceRangeParams: { min: 'priceMin', max: 'priceMax' },
    crawlFields: {
      id: 'wrk_id',
      title: 'titel',
      price: 'preis',
      size: 'groesse',
      rooms: 'anzahl_zimmer',
      link: 'slug',
      address: 'strasse',
      image: 'preview_img_url',
    },
    normalize,
    getListings,
    fetchDetails,
    // A withdrawn offer is answered with 404 (Deutsche Wohnen) or 410 (Vonovia), both of which the
    // shared probe reads as gone.
    activityProbe: checkIfListingIsActive,
    priceTracking: { extract: extractDetailPrice },
  };

  /**
   * Build a run-scoped provider configuration.
   *
   * Returns a fresh object on every call instead of mutating module-level state. Two jobs can be in
   * flight at once - a manual run started while the scheduler is working through the others - and a
   * shared mutable config meant the second job overwrote the first job's URL and blacklist mid-run,
   * so listings were fetched for one job and stored under another.
   *
   * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
   * @param {string[]} [blacklist] Terms to filter listings out by.
   * @returns {ProviderConfig} A configuration usable by a single pipeline run.
   */
  const createConfig = (sourceConfig, blacklist = []) => ({
    ...config,
    enabled: sourceConfig.enabled,
    url: convertWebToApi(sourceConfig.url),
    refererUrl: sourceConfig.url,
    filter: (listing) => applyBlacklist(listing, blacklist ?? []),
  });

  return { config, createConfig, convertWebToApi, fetchSearchToken };
}
