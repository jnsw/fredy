/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import {
  assignMailMessageToListing,
  getMatchedMailThreadAnchors,
  getOwnedListingsForMailMatching,
  getUnmatchedMailMessages,
} from '../storage/mailStorage.js';

/**
 * Links downloaded messages to the listings they are about.
 *
 * Conservative on purpose: a wrong link is worse than none, because it files a landlord's reply
 * under somebody else's flat. Evidence is tried from strongest to weakest, and a link is only made
 * when exactly one of the user's listings qualifies:
 *
 * 1. The listing's code - an id from its portal link - appears in the message (confidence 100).
 * 2. Its street address, house number required, appears in the message (85).
 * 3. The message replies to one that is already linked (95, see `In-Reply-To`/`References`).
 *
 * Everything that stays ambiguous is left for the user to link by hand in the inbox.
 */

/** Confidence recorded per method. */
const CONFIDENCE = Object.freeze({ listing_code: 100, thread: 95, address: 85 });

/** Query parameters portals put a listing id in. */
const ID_PARAMETER =
  /^(?:id|objectid|object_id|listingid|listing_id|offerid|offer_id|adid|ad_id|expose|exposeid|expose_id|oid|reference|ref)$/i;

/**
 * Lowercase, fold German umlauts and accents, and reduce everything else to single spaces, so that
 * matching only ever compares whole words.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeMailMatchText(value) {
  return String(value ?? '')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * {@link normalizeMailMatchText} plus the spellings addresses come in: "12 a" is "12a", and
 * "Musterstraße", "Musterstr." and "Muster Straße" all end up as "muster str".
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAddressText(value) {
  return normalizeMailMatchText(value)
    .replace(/\b(\d{1,4})\s+([a-z])\b/g, '$1$2')
    .replace(/\b([a-z]{3,})(?:strasse|str)\b/g, '$1 str')
    .replace(/\b(?:strasse|str)\b/g, 'str');
}

/**
 * Ids a listing's portal link carries, as candidate codes.
 *
 * Only tokens with a digit in them count, so words like "wohnung" can never become a code, and
 * purely numeric tokens need six digits, so a five-digit postcode cannot either.
 *
 * @param {string|null|undefined} link
 * @returns {string[]}
 */
export function extractListingCodes(link) {
  if (!link) return [];
  const candidates = new Set();
  const addTokens = (value) => {
    let decoded = String(value);
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // A malformed link is still safe to tokenise as it is.
    }
    const tokens = normalizeMailMatchText(decoded).split(' ');
    // "2876543210-203-1234" is one id to a portal and three tokens to the normaliser.
    const compact = tokens.join('');
    for (const token of compact !== tokens[0] ? [...tokens, compact] : tokens) {
      if (!/\d/.test(token)) continue;
      const hasLetter = /[a-z]/.test(token);
      if ((!hasLetter && token.length < 6) || (hasLetter && token.length < 5)) continue;
      candidates.add(token);
    }
  };

  try {
    const url = new URL(link);
    for (const segment of url.pathname.split('/')) addTokens(segment);
    for (const [name, value] of url.searchParams) {
      if (ID_PARAMETER.test(name)) addTokens(value);
    }
  } catch {
    addTokens(link);
  }
  return [...candidates];
}

/**
 * The address forms a listing can be recognised by, most specific first: the full address, and
 * street plus house number on its own for the replies that leave out postcode and city.
 *
 * A house number is required. "10115 Berlin" or a street name alone describes a whole
 * neighbourhood, not a flat.
 *
 * @param {string|null|undefined} address
 * @returns {string[]}
 */
export function extractAddressVariants(address) {
  const normalized = normalizeAddressText(address);
  if (normalized.length < 8 || !/[a-z]/.test(normalized)) return [];
  const tokens = normalized.split(' ');
  const numberIndex = tokens.findIndex((token) => /^\d{1,4}[a-z]?$/.test(token));
  if (numberIndex === -1) return [];
  if (numberIndex === 0) return [normalized];
  const streetAndNumber = tokens.slice(0, numberIndex + 1).join(' ');
  return [...new Set([normalized, streetAndNumber])].filter((value) => value.length >= 6);
}

/**
 * Whether a normalised text contains a phrase as whole words.
 *
 * @param {string} text
 * @param {string} phrase
 * @returns {boolean}
 */
function containsPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

/**
 * Six or more digits that follow a label such as "Objektnummer" or "Exposé-Nr.", with the
 * separators portals like to put into long numbers removed.
 *
 * @param {string} text - Raw, not normalised: the labels and punctuation are what is read.
 * @returns {Set<string>}
 */
function labelledNumbers(text) {
  const numbers = new Set();
  const pattern =
    /(?:objekt(?:nummer|-?nr\.?|\s?id)?|angebots?(?:nummer|-?nr\.?|\s?id)|expos[eé](?:nummer|-?nr\.?|\s?id)?|inserats?(?:nummer|-?nr\.?|\s?id)|referenz(?:nummer|-?nr\.?|\s?id)?|scout-?id)\s*[:#-]?\s*(\d[\d ./-]{4,}\d)/giu;
  for (const match of String(text ?? '').matchAll(pattern)) {
    const digits = match[1].replace(/\D/g, '');
    if (digits.length >= 6) numbers.add(digits);
  }
  return numbers;
}

/**
 * A Message-ID in the form it is compared in.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeMessageId(value) {
  return String(value ?? '')
    .trim()
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase();
}

/**
 * The messages a message replies to.
 *
 * @param {{inReplyTo?: string|null, references?: string[]}} message
 * @returns {string[]}
 */
function referencedIds(message) {
  const references = Array.isArray(message.references) ? message.references : [];
  return [message.inReplyTo, ...references].map(normalizeMessageId).filter(Boolean);
}

/**
 * The registrable part of a host name, good enough to tell portals apart.
 *
 * @param {string|null|undefined} host
 * @returns {string|null}
 */
function siteOf(host) {
  const labels = String(host ?? '')
    .toLowerCase()
    .replace(/^www\./, '')
    .split('.')
    .filter(Boolean);
  return labels.length >= 2 ? labels.slice(-2).join('.') : null;
}

/**
 * Narrow several candidates down using weaker hints: a sender at the listing's portal, the
 * provider named in the text, the listing's (distinctive) title in the text. Each hint only applies
 * when it leaves at least one candidate.
 *
 * @param {Object[]} candidates
 * @param {{senderAddress?: string|null}} message
 * @param {string} text
 * @returns {Object[]}
 */
function narrowCandidates(candidates, message, text) {
  if (candidates.length <= 1) return candidates;
  const filters = [
    (listing) => listing.site != null && listing.site === siteOf(String(message.senderAddress ?? '').split('@')[1]),
    (listing) => listing.normalizedProvider.length > 0 && containsPhrase(text, listing.normalizedProvider),
    (listing) => listing.normalizedTitle != null && containsPhrase(text, listing.normalizedTitle),
  ];
  let narrowed = candidates;
  for (const filter of filters) {
    if (narrowed.length <= 1) break;
    const kept = narrowed.filter(filter);
    if (kept.length > 0) narrowed = kept;
  }
  return narrowed;
}

/**
 * What the matcher reads from a listing, computed once per run.
 *
 * @param {{id: string, provider: string|null, title: string|null, address: string|null, link: string|null}} listing
 * @returns {Object}
 */
function prepareListing(listing) {
  let site = null;
  try {
    site = siteOf(new URL(listing.link).hostname);
  } catch {
    // No usable link: the listing can still be found by its address.
  }
  const title = normalizeMailMatchText(listing.title);
  return {
    id: listing.id,
    codes: extractListingCodes(listing.link),
    addressVariants: extractAddressVariants(listing.address),
    site,
    normalizedProvider: normalizeMailMatchText(listing.provider),
    // Short or generic titles ("3-Zimmer-Wohnung") would match half the inbox.
    normalizedTitle: title.length >= 16 && title.split(' ').length >= 3 ? title : null,
  };
}

/**
 * Find the one listing a message is directly about, by code or by address.
 *
 * @param {Object} message
 * @param {Object[]} listings - Prepared listings.
 * @returns {{listing: Object|null, method: 'listing_code'|'address', ambiguous: boolean}}
 */
function directMatch(message, listings) {
  const raw = [message.subject, message.textBody].filter(Boolean).join('\n');
  const text = normalizeMailMatchText(raw);
  if (!text) return { listing: null, method: 'listing_code', ambiguous: false };

  const labelled = labelledNumbers(raw);
  const byCode = narrowCandidates(
    listings.filter((listing) =>
      listing.codes.some((code) => containsPhrase(text, code) || (/^\d+$/.test(code) && labelled.has(code))),
    ),
    message,
    text,
  );
  if (byCode.length > 0) {
    return { listing: byCode.length === 1 ? byCode[0] : null, method: 'listing_code', ambiguous: byCode.length > 1 };
  }

  const addressText = normalizeAddressText(raw);
  const byAddress = narrowCandidates(
    listings.filter((listing) => listing.addressVariants.some((variant) => containsPhrase(addressText, variant))),
    message,
    text,
  );
  return { listing: byAddress.length === 1 ? byAddress[0] : null, method: 'address', ambiguous: byAddress.length > 1 };
}

/**
 * Link every unlinked message of a user that can be linked with confidence.
 *
 * Direct evidence is tried first for every message. Thread replies are resolved afterwards, and
 * repeatedly, because a mailbox hands messages out newest first: the reply can come before the
 * message it answers, and only once that one is linked does the reply have something to follow.
 *
 * @param {string} userId
 * @param {Object} [options] - Seams for tests.
 * @param {Object[]} [options.listings]
 * @param {Function} [options.getMessages]
 * @param {Object[]} [options.anchors]
 * @param {Function} [options.assign]
 * @param {number} [options.pageSize]
 * @returns {Promise<{processed: number, matched: number, ambiguous: number}>}
 */
export async function matchUnmatchedMailMessages(userId, options = {}) {
  const listings = (options.listings ?? getOwnedListingsForMailMatching(userId)).map(prepareListing);
  if (listings.length === 0) return { processed: 0, matched: 0, ambiguous: 0 };

  const getMessages = options.getMessages ?? getUnmatchedMailMessages;
  const assign = options.assign ?? assignMailMessageToListing;
  const pageSize = Math.max(1, Math.min(500, Number(options.pageSize) || 200));
  const known = new Set(listings.map((listing) => listing.id));

  /** Message-id -> listing ids it is linked to. */
  const threads = new Map();
  const remember = (messageId, listingId) => {
    const id = normalizeMessageId(messageId);
    if (!id || !known.has(listingId)) return;
    threads.set(id, (threads.get(id) ?? new Set()).add(listingId));
  };
  for (const anchor of options.anchors ?? getMatchedMailThreadAnchors(userId)) {
    remember(anchor.messageId, anchor.listingId);
  }
  const threadListings = (message) => {
    const ids = new Set();
    for (const reference of referencedIds(message)) {
      for (const listingId of threads.get(reference) ?? []) ids.add(listingId);
    }
    return ids;
  };

  let processed = 0;
  let matched = 0;
  const pending = [];
  let cursor = null;

  while (true) {
    const page = getMessages(userId, pageSize, cursor);
    if (page.length === 0) break;
    processed += page.length;

    for (const message of page) {
      const { listing, method, ambiguous } = directMatch(message, listings);
      const inThread = threadListings(message);
      // A message that replies into one listing's thread but names another listing's code is
      // exactly the case where a guess would be wrong half the time. It waits for the user.
      const contradictsThread = listing != null && inThread.size === 1 && !inThread.has(listing.id);

      if (
        listing != null &&
        !contradictsThread &&
        assign({ userId, messageId: message.id, listingId: listing.id, method, confidence: CONFIDENCE[method] })
      ) {
        matched += 1;
        remember(message.messageId, listing.id);
      } else {
        pending.push({ message, ambiguous: ambiguous || contradictsThread, blocked: contradictsThread });
      }
    }

    if (page.length < pageSize) break;
    const last = page.at(-1);
    cursor = { sortAt: Number(last.sortAt), id: last.id };
    if (!Number.isFinite(cursor.sortAt)) break;
  }

  let unresolved = pending;
  let progress = true;
  while (progress && unresolved.length > 0) {
    progress = false;
    const next = [];
    for (const entry of unresolved) {
      const candidates = entry.blocked ? new Set() : threadListings(entry.message);
      if (candidates.size !== 1) {
        next.push({ ...entry, ambiguous: entry.ambiguous || candidates.size > 1 });
        continue;
      }
      const [listingId] = candidates;
      if (
        assign({
          userId,
          messageId: entry.message.id,
          listingId,
          method: 'thread',
          confidence: CONFIDENCE.thread,
        })
      ) {
        matched += 1;
        progress = true;
        remember(entry.message.messageId, listingId);
      } else {
        next.push(entry);
      }
    }
    unresolved = next;
  }

  return { processed, matched, ambiguous: unresolved.filter((entry) => entry.ambiguous).length };
}
