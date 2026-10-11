/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotifications } from './mocks/mockNotification.js';

/**
 * A 60 m² flat for 200.000 EUR. At 10 EUR/m² it yields 3,6 % gross, at 15 EUR/m² 5,4 %.
 *
 * @param {string} id
 * @returns {Object}
 */
function flat(id) {
  return {
    id,
    title: `flat ${id}`,
    address: 'somewhere',
    price: 200000,
    size: 60,
    latitude: 50.94,
    longitude: 6.96,
    link: `http://example.com/${id}`,
  };
}

/**
 * Runs one job and answers with the ids that made it into a notification.
 *
 * @param {Object} params
 * @param {Object[]} params.listings
 * @param {string} params.providerId Unique per test; the mock store keys its "already seen" set on it.
 * @param {('rent'|'buy'|null)} params.dealType
 * @param {Object|null} [params.specFilter]
 * @returns {Promise<string[]>}
 */
async function notifiedIds({ listings, providerId, dealType, specFilter = null }) {
  const Fredy = await mockFredy();
  const fredy = new Fredy(
    {
      url: 'http://example.com',
      getListings: () => Promise.resolve(listings),
      normalize: (l) => l,
      filter: () => true,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    },
    { id: `job-${providerId}`, notificationAdapter: null, specFilter, spatialFilter: null, dealType },
    providerId,
    { checkAndAddEntry: () => false },
    undefined,
  );
  try {
    await fredy.execute();
  } catch {
    // Every listing filtered out ends the run with NoNewListingsWarning, which is a valid outcome.
  }
  return (getLastNotification()?.payload ?? []).map((entry) => entry.id);
}

describe("applying a purchase job's minimum gross yield", () => {
  beforeEach(() => {
    mockStore.deletedIds.length = 0;
    mockStore.rentEstimateCalls.length = 0;
    resetNotifications();
    // "cheap" sits in an area that lets at 10 EUR/m², "good" in one at 15, and nothing is known
    // about the rentals around "unknown".
    mockStore.setRentEstimate((listing) => ({ cheap: 10, good: 15 })[listing.id.split('-')[0]] ?? null);
  });

  afterEach(() => {
    mockStore.setRentEstimate(null);
  });

  it('soft-deletes a purchase below the minimum and notifies the rest', async () => {
    const notified = await notifiedIds({
      listings: [flat('cheap-1'), flat('good-1')],
      providerId: 'yield-below',
      dealType: 'buy',
      specFilter: { minGrossYield: 5 },
    });

    expect(notified).toEqual(['good-1']);
    // Soft-deleted like the area filter's rejects, so the next run does not fetch and geocode it again.
    expect(mockStore.deletedIds).toEqual(['cheap-1']);
  });

  // "Too few rentals nearby" says nothing about the flat. Dropping it would make the filter strictest
  // where it knows the least.
  it('keeps a purchase it has no rent estimate for', async () => {
    const notified = await notifiedIds({
      listings: [flat('unknown-1'), flat('cheap-2')],
      providerId: 'yield-unknown',
      dealType: 'buy',
      specFilter: { minGrossYield: 5 },
    });

    expect(notified).toEqual(['unknown-1']);
    expect(mockStore.deletedIds).toEqual(['cheap-2']);
  });

  it('estimates the rent of a purchase even without a minimum, and filters nothing', async () => {
    const notified = await notifiedIds({
      listings: [flat('cheap-3'), flat('good-3')],
      providerId: 'yield-no-minimum',
      dealType: 'buy',
      specFilter: { minGrossYield: null },
    });

    expect(notified).toEqual(['cheap-3', 'good-3']);
    expect(mockStore.deletedIds).toEqual([]);
    // The detail page shows the yield whether or not the job filters on it.
    expect(mockStore.rentEstimateCalls).toHaveLength(1);
  });

  it('ends the run quietly when every purchase falls short', async () => {
    const notified = await notifiedIds({
      listings: [flat('cheap-4'), flat('cheap-5')],
      providerId: 'yield-all-below',
      dealType: 'buy',
      specFilter: { minGrossYield: 4 },
    });

    expect(notified).toEqual([]);
    expect(mockStore.deletedIds).toEqual(['cheap-4', 'cheap-5']);
  });

  // Rentals are unchanged: no estimate is made, and a minimum yield left in the spec filter from when
  // the job was a purchase job is ignored.
  it('leaves a rent job alone, whatever its spec filter holds', async () => {
    const notified = await notifiedIds({
      listings: [flat('cheap-6')],
      providerId: 'yield-rent-job',
      dealType: 'rent',
      specFilter: { minGrossYield: 50 },
    });

    expect(notified).toEqual(['cheap-6']);
    expect(mockStore.deletedIds).toEqual([]);
    expect(mockStore.rentEstimateCalls).toEqual([]);
  });

  it('leaves a job without a deal type alone', async () => {
    const notified = await notifiedIds({
      listings: [flat('cheap-7')],
      providerId: 'yield-no-deal-type',
      dealType: null,
      specFilter: { minGrossYield: 50 },
    });

    expect(notified).toEqual(['cheap-7']);
    expect(mockStore.rentEstimateCalls).toEqual([]);
  });
});
