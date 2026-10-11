/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { toPriceChangeListing } from '../priceChangeMessage.js';

/**
 * How long the endpoint may take to answer, in milliseconds.
 *
 * Native `fetch` has no `timeout` option (node-fetch had one, and this adapter still passed it), so
 * the limit is enforced with an abort signal. Without it an endpoint that accepts the connection and
 * never answers holds the job's run at the notification step indefinitely.
 * @type {number}
 */
export const ENDPOINT_TIMEOUT_MS = 10_000;

/**
 * How much of an error response is quoted in the error, so a misbehaving endpoint that answers with
 * a whole HTML page does not flood the log.
 * @type {number}
 */
const MAX_ERROR_BODY_LENGTH = 200;

/**
 * POST to the endpoint, bounded by {@link ENDPOINT_TIMEOUT_MS}, and reject unless it accepted.
 *
 * `fetch` resolves for every status the server sends, so a 401 for a wrong token or a 500 from a
 * broken receiver used to count as delivered. Rejecting turns both into an error in Fredy's log and
 * into a failed test notification in the channel form, which is where the user looks.
 *
 * @param {string} endpointUrl
 * @param {Object} fetchOptions Options for `fetch`, without a signal.
 * @returns {Promise<Response>} The response, when its status is 2xx.
 * @throws {Error} When the endpoint answered with another status or did not answer in time.
 */
const post = async (endpointUrl, fetchOptions) => {
  let response;
  try {
    response = await fetch(endpointUrl, { ...fetchOptions, signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS) });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new Error(`HTTP notification timed out after ${ENDPOINT_TIMEOUT_MS / 1000} s`, { cause: error });
    }
    throw error;
  }
  if (response.ok) {
    return response;
  }
  let detail = '';
  try {
    const text = (await response.text()).trim();
    if (text) detail = ` (${text.slice(0, MAX_ERROR_BODY_LENGTH)})`;
  } catch {
    // An unreadable body leaves the status code as the whole explanation.
  }
  throw new Error(`HTTP notification could not be sent. Status code: ${response.status}${detail}`);
};

const mapListing = (listing, baseUrl) => ({
  address: listing.address,
  description: listing.description,
  id: listing.id,
  imageUrl: listing.image,
  price: listing.price,
  size: listing.size,
  title: listing.title,
  // Absent rather than null when nothing was routed, so a consumer cannot mistake "not looked up"
  // for a journey of no length.
  ...(listing.commute ? { commute: listing.commute } : {}),
  url: listing.link,
  fredyUrl: baseUrl && listing.id ? `${baseUrl}/#/listings/listing/${listing.id}` : null,
});

export const send = async ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { authToken, endpointUrl, selfSignedCerts } = notificationConfig.find((a) => a.id === config.id).fields;

  const listings = newListings.map((l) => mapListing(l, baseUrl));
  const body = {
    jobId: jobKey,
    timestamp: new Date().toISOString(),
    provider: serviceName,
    listings,
  };

  const headers = {
    'Content-Type': 'application/json',
  };
  if (authToken != null) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  let fetchOptions = {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  };

  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({
      connect: { rejectUnauthorized: false },
    });
  }

  return post(endpointUrl, fetchOptions);
};

/**
 * Posts price changes to the same endpoint as new listings, under an explicit `event` discriminator.
 *
 * The payload gains a field rather than reusing `listings` silently: a receiver written before this
 * existed keeps parsing what it always did, and one written after can tell the two events apart
 * without guessing from the shape.
 *
 * @param {{serviceName: string, priceChanges: any[], notificationConfig: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>}
 */
export const sendPriceChange = async ({ serviceName, priceChanges, notificationConfig, jobKey, baseUrl }) => {
  const { authToken, endpointUrl, selfSignedCerts } = notificationConfig.find((a) => a.id === config.id).fields;

  const body = {
    event: 'priceChange',
    jobId: jobKey,
    timestamp: new Date().toISOString(),
    provider: serviceName,
    priceChanges: priceChanges.map((change) => ({
      ...mapListing(toPriceChangeListing(change), baseUrl),
      oldPrice: change.oldPrice,
      newPrice: change.newPrice,
      changePercent: change.changePercent,
      direction: change.direction,
    })),
  };

  const headers = { 'Content-Type': 'application/json' };
  if (authToken != null) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const fetchOptions = { method: 'POST', headers, body: JSON.stringify(body) };
  if (selfSignedCerts === true) {
    fetchOptions.dispatcher = new (await import('undici')).Agent({ connect: { rejectUnauthorized: false } });
  }

  return post(endpointUrl, fetchOptions);
};

export const config = {
  id: 'http',
  name: 'HTTP',
  readme: readAdapterReadme('http.md'),
  description: 'Fredy will send a generic HTTP POST request.',
  fields: {
    endpointUrl: {
      description: "Your application's endpoint URL.",
      label: 'Endpoint URL',
      type: 'text',
      // Shown as the channel's destination in the UI.
      target: true,
    },
    selfSignedCerts: {
      label: 'Self-signed certificates',
      type: 'boolean',
    },
    authToken: {
      description: "Your application's auth token, if required by your endpoint.",
      label: 'Auth token (optional)',
      optional: true,
      type: 'text',
      // Never leaves the server for anyone who may not edit this channel.
      secret: true,
    },
  },
};
