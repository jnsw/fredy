/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';

/**
 * The pipeline labels every listing with the currency its price is in before storing it, from the
 * provider's `metaInformation.currency` - so the row, the benchmark and the notification all read the
 * same answer. Resolved against the real provider modules: Flatfox declares francs, ImmoScout
 * declares nothing and so lists in euros.
 */
function configFor(listing) {
  return {
    url: 'http://example.com',
    getListings: () => Promise.resolve([listing]),
    normalize: (l) => l,
    filter: () => true,
    crawlFields: { id: 'id', title: 'title', price: 'price' },
    requiredFieldNames: ['id', 'title', 'price'],
  };
}

const job = { id: 'test-job', notificationAdapter: null, specFilter: null, spatialFilter: null };

/**
 * Run one listing through the pipeline as the given provider and hand it back afterwards.
 *
 * @param {string} providerId
 * @param {Object} listing
 * @returns {Promise<Object>}
 */
async function run(providerId, listing) {
  const Fredy = await mockFredy();
  const fredy = new Fredy(configFor(listing), job, providerId, { checkAndAddEntry: () => false }, undefined);
  try {
    await fredy.execute();
  } catch {
    // NoNewListingsWarning is control flow here; the listing was labelled before it was stored.
  }
  return listing;
}

const flat = (overrides = {}) => ({
  id: 'flat-1',
  title: 'Flat',
  price: 2710,
  link: 'http://example.com/1',
  ...overrides,
});

beforeEach(() => {
  mockStore.resetListings();
});

describe('the pipeline labels each listing with its currency', () => {
  it("takes the provider's declaration", async () => {
    expect((await run('flatfox', flat())).currency).toBe('CHF');
  });

  it('labels a provider that declares nothing as euros', async () => {
    expect((await run('immoscout', flat())).currency).toBe('EUR');
  });

  it('labels a provider it does not know as euros', async () => {
    expect((await run('no-such-provider', flat())).currency).toBe('EUR');
  });

  // A portal serving several currencies knows per advert, and only it does.
  it("keeps a currency the provider's normalize() set on the listing", async () => {
    expect((await run('immoscout', flat({ currency: 'CHF' }))).currency).toBe('CHF');
  });
});
