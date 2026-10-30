/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Where the user stands with a listing, as stored in `listings.status`.
 *
 * The column holds a JSON payload `{ status, setAt, appointmentAt? }`; `null` means no decision yet.
 * The list used to be three words long and was spelled out separately in the router, the storage,
 * the filter parser and the MCP tool. It is defined here once now, because it grew to the stages an
 * application actually goes through.
 *
 * `ui/src/components/listings/statusOptions.js` carries the same list for the frontend, which may
 * not import from `lib/`; `test/ui/listingStatusInSync.test.js` keeps the two equal.
 */

/**
 * Every status, in the order an application goes through them.
 *
 * - `applied`: the user reached out.
 * - `documents_sent`: documents were asked for (Selbstauskunft, Schufa, income) and handed in.
 * - `invited`: invited to a viewing; may carry the appointment.
 * - `visited`: the viewing took place.
 * - `accepted`, `rejected`: the outcome.
 * - `not_invited`: turned down before any viewing.
 *
 * @type {readonly string[]}
 */
export const LISTING_STATUSES = Object.freeze([
  'applied',
  'documents_sent',
  'invited',
  'visited',
  'accepted',
  'rejected',
  'not_invited',
]);

/** The statuses that carry a viewing appointment. */
export const APPOINTMENT_STATUSES = Object.freeze(['invited', 'visited']);

/**
 * How far along each status is. An update found in a mail may only move a listing forward: an
 * acknowledgement arriving late must not undo an invitation, and nothing undoes an outcome.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const STATUS_RANK = Object.freeze({
  applied: 1,
  documents_sent: 2,
  invited: 3,
  visited: 4,
  accepted: 5,
  rejected: 5,
  not_invited: 5,
});

/**
 * A status in its canonical form, or null for anything that is not one.
 *
 * @param {unknown} status
 * @returns {string|null}
 */
export function normalizeListingStatus(status) {
  if (status == null) return null;
  const normalized = String(status).trim().toLowerCase();
  return LISTING_STATUSES.includes(normalized) ? normalized : null;
}

/**
 * A plausible appointment time, or null.
 *
 * @param {unknown} value - Epoch milliseconds.
 * @returns {number|null}
 */
export function normalizeAppointment(value) {
  const number = Number(value);
  return value != null && value !== '' && Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

/**
 * The payload to store when a listing moves to `next`.
 *
 * An appointment survives a move between `invited` and `visited` - the date of a viewing does not
 * stop being true once it happened - and is dropped for every other status.
 *
 * @param {{status?: string, appointmentAt?: number}|null} previous - The stored payload.
 * @param {string|null} next - A canonical status, or null to clear.
 * @param {Object} [options]
 * @param {number|null} [options.appointmentAt] - A new appointment, replacing the stored one.
 * @param {number} [options.now]
 * @returns {{status: string, setAt: number, appointmentAt?: number}|null}
 */
export function buildStatusPayload(previous, next, { appointmentAt = null, now = Date.now() } = {}) {
  if (next == null) return null;
  const payload = { status: next, setAt: now };
  if (APPOINTMENT_STATUSES.includes(next)) {
    const appointment = normalizeAppointment(appointmentAt) ?? normalizeAppointment(previous?.appointmentAt);
    if (appointment != null) payload.appointmentAt = appointment;
  }
  return payload;
}

/**
 * Whether an update read from a mail may replace the stored status.
 *
 * @param {string|null|undefined} current
 * @param {string} next
 * @returns {boolean}
 */
export function mayAdvanceStatus(current, next) {
  if (current == null) return true;
  if (current === next) return true;
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0);
}
