/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Immoweb, Belgium's largest property portal.
 *
 * Users paste the address of a result page, e.g.
 * https://www.immoweb.be/en/search/apartment/for-rent?countries=BE&page=1&orderBy=newest. The page
 * is rendered in the job's browser and its cards are read with the generic extractor; there is no
 * `getListings` of its own. The site answers in English, French or Dutch (`/en/`, `/fr/`, `/nl/`),
 * whichever the url names, and writes its figures in that language's style, which is why the numbers
 * here go through `parseLocaleNumber` rather than the German-minded `extractNumber`.
 */

import { buildHash, isOneOf } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { parseLocaleNumber } from '../utils/parse-locale-number.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

const BASE_URL = 'https://www.immoweb.be/';

/**
 * The first figure in a text, with its separators: "1,250" out of "€1,250 + €150", "250.000" out of
 * "Vanaf 250.000 €". A range or a second figure resolves to the first one.
 */
const FIRST_FIGURE = /\d[\d.,]*/;

/**
 * Living space: the figure in front of the m² unit, the first one of a range ("55 - 90 m²").
 *
 * Anchored on the unit rather than on a position because a card does not always state it. One was
 * found with "3 bdr. 3 bedrooms" and no m² anywhere, where "the last number in the text" would have
 * stored the bedroom count as square metres. No unit, no size.
 */
const SIZE = /(\d[\d.,]*)(?:\s*-\s*\d[\d.,]*)?\s*(?:m²|m2)/i;

/**
 * Bedrooms: the figure in front of the word, in each of the site's languages, again the first one
 * of a range. Anchored on the word rather than on the markup, because project cards (new builds)
 * render their bedroom range as bare screen-reader spans without the `.abbreviation` wrapper an
 * ordinary card has.
 */
const BEDROOMS = /(\d+)(?:\s*-\s*\d+)?\s*(?:bedrooms?|chambres?|slaapkamers?|schlafzimmer)\b/i;

/** `url(...)` inside a style attribute, with or without the quotes CSS serialisation may add. */
const STYLE_URL = /url\((['"]?)([^)]+?)\1\)/;

/**
 * The advert's own address and number, without the search that led to it.
 *
 * A card links to `/en/classified/<type>/<deal>/<locality>/<postcode>/<id>`, sometimes with a
 * `searchId` that changes with every search. The number is what identifies the advert, so it is
 * what the listing's id is built from, and the query is dropped from the link so that the same
 * advert found by two runs is stored once.
 *
 * @param {string|null|undefined} href
 * @returns {{link: string, classifiedId: string}|null}
 */
function parseClassifiedLink(href) {
  if (!href) return null;
  let url;
  try {
    url = new URL(href, BASE_URL);
  } catch {
    return null;
  }
  const classifiedId = url.pathname.split('/').filter(Boolean).pop();
  if (!classifiedId) return null;
  return { link: `${url.origin}${url.pathname}`, classifiedId };
}

/**
 * @param {any} o One card, as the crawl fields below read it.
 * @returns {ParsedListing}
 */
function normalize(o) {
  const classified = parseClassifiedLink(o.link);

  // The screen-reader text of the price ("1250€"), which carries no grouping in any language the
  // site was seen in. The visible price next to it does ("€1,250", "1.250 €").
  const priceFigure = (o.priceRaw || '').match(FIRST_FIGURE);
  const price = priceFigure ? parseLocaleNumber(priceFigure[0]) : null;

  // Bedroom count and living space share one paragraph, in both their abbreviated and their
  // screen-reader form: "2 bdr. 2 bedrooms · 78 m² square meters". The middle dot is not always
  // there, and the second figure beside m² is sometimes a range and sometimes the plot.
  const propertyText = o.propertyText || '';
  const sizeMatch = propertyText.match(SIZE);
  const roomsMatch = propertyText.match(BEDROOMS);

  const imageMatch = (o.image || '').match(STYLE_URL);

  return {
    // Without an advert number there is nothing to tell this advert from the next one at the same
    // price, so it gets no id and the pipeline drops it.
    id: classified == null ? null : buildHash(classified.classifiedId, price == null ? null : String(price)),
    link: classified?.link ?? null,
    title: (o.title || '').trim(),
    price,
    size: sizeMatch ? parseLocaleNumber(sizeMatch[1]) : null,
    rooms: roomsMatch ? Number.parseInt(roomsMatch[1], 10) : null,
    address: o.address || 'NO ADDRESS FOUND',
    image: imageMatch ? imageMatch[2] : null,
    description: null,
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

/** @type {ProviderConfig} */
const config = {
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  url: null,
  sortByDateParam: 'orderBy=newest',
  // ?minPrice=500&maxPrice=1000, the two names the site's own filter writes.
  priceRangeParams: { min: 'minPrice', max: 'maxPrice' },
  // `body` rather than the card: the extractor returns the inner html of the first element the
  // selector matches, so waiting for a card would hand back that one card instead of the page.
  waitForSelector: 'body',
  crawlContainer: 'li.card-list__item',
  crawlFields: {
    // The parser drops a container without an id, which is what keeps ad slots out of the results.
    // The id the listing is stored under is built in normalize(), from the link.
    id: '.card__title-link@href',
    link: '.card__title-link@href',
    title: '.card__title-link | trim',
    priceRaw: '.card--list-classified__price .sr-only | trim',
    propertyText: '.card__information--property | trim',
    image: '.card__media-container@style',
    address: '.card__information:not(.card__information--property) | trim',
  },
  normalize,
  activityProbe: checkIfListingIsActive,
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
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  countries: ['be'],
  name: 'Immoweb',
  baseUrl: BASE_URL,
  id: 'immoweb',
};

export { config };
