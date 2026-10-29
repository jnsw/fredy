/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet, xhrPost } from './xhr.js';

/**
 * Client for the viewings page: listings the user is invited to view, or has viewed.
 *
 * Not a store slice: the page is the only reader, and it asks again whenever it opens.
 */

/**
 * @typedef {Object} Viewing
 * @property {string} id
 * @property {string|null} title
 * @property {string|null} address
 * @property {string|null} provider
 * @property {string|null} link
 * @property {string|null} imageUrl
 * @property {{status: 'invited'|'visited', setAt: number, appointmentAt?: number}} status
 * @property {number|null} appointmentAt
 */

/**
 * @returns {Promise<Viewing[]>}
 */
export async function getViewings() {
  const response = await xhrGet('/api/listings/viewings');
  return response.json?.viewings ?? [];
}

/**
 * Set or clear the appointment of a viewing.
 *
 * @param {string} listingId
 * @param {number|null} appointmentAt - Epoch milliseconds.
 * @returns {Promise<void>}
 */
export async function setViewingAppointment(listingId, appointmentAt) {
  await xhrPost(`/api/listings/${encodeURIComponent(listingId)}/appointment`, { appointmentAt });
}
