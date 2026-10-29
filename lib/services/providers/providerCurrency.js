/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { getProviders } from '../../utils.js';
import { currencyForListing } from './currencies.js';

/**
 * The currency of one listing found by a provider, resolved against the loaded provider modules.
 *
 * Per listing rather than per provider, for the same reason the geocoder asks per listing: a portal
 * serving several countries may say which one an advert is in (see `currencyForListing`). An id
 * matching no loaded provider answers with the default, since a listing can outlive the module that
 * found it.
 *
 * @param {string|null|undefined} providerId
 * @param {{currency?: unknown}|null|undefined} listing
 * @returns {Promise<string>} ISO 4217 code.
 */
export async function getCurrencyForListing(providerId, listing) {
  const providers = await getProviders();
  const meta = (providers ?? []).find((provider) => provider?.metaInformation?.id === providerId)?.metaInformation;
  return currencyForListing(meta, listing);
}
