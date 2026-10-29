/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Reading one SMG search result into a listing, the same way for ImmoScout24.ch and Homegate: both
 * portals answer from one API with one model, so only the link differs.
 */

import { buildHash } from '../../utils.js';
import { publicationDate } from '../../utils/publicationDate.js';
import { normalizeBuildYear } from '../../utils/buildingFacts.js';
/** @import { ParsedListing } from '../../types/listing.js' */

/** A url ending in an image file, which is how a photo is told from a plan or a brochure. */
const IMAGE_URL = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

/**
 * Read one of the API's numbers. Not `extractNumber`: that parser is built for German-formatted text
 * and would read the JSON decimal `2.5` as twenty-five.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function toNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {unknown} value
 * @returns {string|null} The value as trimmed text, or null when it holds nothing.
 */
function text(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The language block the advertiser wrote the listing in. The others are machine translations.
 *
 * @param {any} listing
 * @returns {any}
 */
function primaryBlock(listing) {
  const localization = listing?.localization ?? {};
  return (
    localization[localization.primary] ?? localization.de ?? localization.fr ?? localization.it ?? localization.en ?? {}
  );
}

/**
 * "Corso San Gottardo 24, 6830 Chiasso". `street` already carries the house number.
 *
 * @param {any} address
 * @returns {string|null}
 */
function buildAddress(address) {
  const street = text(address?.street);
  const town = [text(address?.postalCode), text(address?.locality)].filter(Boolean).join(' ');
  const line = [street, town].filter(Boolean).join(', ');
  return line.length > 0 ? line : null;
}

/**
 * The price as Fredy means it, and what it says about the running costs.
 *
 * A rent counts only when it is a monthly rent for the whole object: commercial adverts quote a
 * yearly price per square metre (`interval: YEAR`, `area: M2`), which is not a rent anybody pays
 * each month. The Nettomiete is preferred, as on every other provider, because the affordability
 * check adds the Nebenkosten itself; the Bruttomiete is the fallback, and is marked as including them.
 *
 * @param {any} prices The listing's `prices`.
 * @returns {{price: number|null, chargesIncluded?: boolean, charges?: number}}
 */
function readPrice(prices) {
  const rent = prices?.rent;
  if (rent != null && Object.keys(rent).length > 0) {
    const monthly = (rent.interval == null || rent.interval === 'MONTH') && rent.area !== 'M2';
    if (!monthly) return { price: null };

    const net = toNumber(rent.net);
    const gross = toNumber(rent.gross);
    const extra = toNumber(rent.extra) ?? (net != null && gross != null && gross > net ? gross - net : null);
    if (net != null) return { price: net, chargesIncluded: false, ...(extra != null ? { charges: extra } : {}) };
    if (gross != null) return { price: gross, chargesIncluded: true };
    return { price: null };
  }

  const buy = prices?.buy;
  return { price: buy?.area === 'M2' ? null : toNumber(buy?.price) };
}

/**
 * @param {any} entry One `results[]` entry of the search answer.
 * @param {(listing: any) => string|null} linkOf Builds the portal's own link for the listing.
 * @returns {ParsedListing}
 */
export function normalizeSmgListing(entry, linkOf) {
  const listing = entry?.listing ?? {};
  const block = primaryBlock(listing);
  const { price, ...rentBasis } = readPrice(listing.prices);
  const latitude = toNumber(listing.address?.geoCoordinates?.latitude);
  const longitude = toNumber(listing.address?.geoCoordinates?.longitude);
  const image = (Array.isArray(block.attachments) ? block.attachments : []).find(
    (attachment) =>
      typeof attachment?.url === 'string' && (attachment.type === 'IMAGE' || IMAGE_URL.test(attachment.url)),
  );
  const publishedAt = publicationDate(listing.meta?.createdAt);
  const buildYear = normalizeBuildYear(listing.characteristics?.yearBuilt);

  return {
    // The price goes into the hash, so a reduction reaches the user as a new listing. As text,
    // because `buildHash` skips anything without a length and a number would be dropped silently.
    id: buildHash(text(listing.id) ?? '', price == null ? null : String(price)),
    title: text(block.text?.title),
    link: listing.id == null ? null : linkOf(listing),
    price,
    ...(price != null ? rentBasis : {}),
    size: toNumber(listing.characteristics?.livingSpace),
    rooms: toNumber(listing.characteristics?.numberOfRooms),
    address: buildAddress(listing.address),
    description: text(block.text?.description),
    image: image?.url ?? null,
    ...(publishedAt != null ? { publishedAt } : {}),
    ...(buildYear != null ? { buildYear } : {}),
    // The API places every listing, so no geocoding request is spent on it.
    ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
  };
}
