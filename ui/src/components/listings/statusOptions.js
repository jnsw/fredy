/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Where the user stands with a listing.
 *
 * `null` is a value here rather than the absence of one: "not decided yet" is a state somebody
 * returns a listing to, so it needs a label and a place in the control like the others.
 *
 * The order is the order an application goes through. The backend keeps the same list in
 * `lib/services/listings/listingStatus.js`, which the frontend may not import;
 * `test/ui/listingStatusInSync.test.js` fails when the two drift apart.
 *
 * @typedef {('applied'|'documents_sent'|'invited'|'visited'|'accepted'|'rejected'|'not_invited'|null)} ListingStatus
 */

/** @type {ListingStatus[]} */
export const STATUS_VALUES = [
  null,
  'applied',
  'documents_sent',
  'invited',
  'visited',
  'accepted',
  'rejected',
  'not_invited',
];

/**
 * The label of one status.
 *
 * @param {(key: string) => string} t
 * @param {ListingStatus} status
 * @returns {string}
 */
export function statusLabel(t, status) {
  return t(`listings.status.${status ?? 'none'}`);
}

/**
 * Every option with its label, in the order the controls show them.
 *
 * Shared because the detail page, the tables and the filter all offer them, and separate copies of
 * the list is how they end up offering different words for the same state.
 *
 * @param {(key: string) => string} t
 * @returns {Array<{value: ListingStatus, label: string}>}
 */
export function statusOptions(t) {
  return STATUS_VALUES.map((value) => ({ value, label: statusLabel(t, value) }));
}
