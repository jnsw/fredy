/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockFredy } from './utils.js';
import * as mockStore from './mocks/mockStore.js';
import { get as getLastNotification, reset as resetNotifications } from './mocks/mockNotification.js';

/**
 * A listing as a provider's normalize() hands it over.
 *
 * @param {string} id
 * @param {string|null} [availableFrom] What the search page stated, if anything.
 * @returns {Object}
 */
function listing(id, availableFrom) {
  return {
    id,
    title: `listing ${id}`,
    address: 'somewhere',
    price: 900,
    link: `http://example.com/${id}`,
    ...(availableFrom === undefined ? {} : { availableFrom }),
  };
}

/**
 * Runs one job and reports what happened to its listings.
 *
 * @param {Object} params
 * @param {Object[]} params.listings
 * @param {string} params.providerId Unique per test; the mock store keys its "already seen" set on it.
 * @param {Object|null} params.specFilter As stored on the job.
 * @param {Record<string, string|null>} [params.detailDates] The date each listing's exposé states,
 *   for a provider that only has it there. Without it the provider has no detail fetch at all.
 * @returns {Promise<{notified: string[], deleted: string[], detailed: string[]}>}
 */
async function run({ listings, providerId, specFilter, detailDates }) {
  const detailed = [];
  const fetchDetails =
    detailDates == null
      ? undefined
      : async (item) => {
          detailed.push(item.id);
          return { ...item, availableFrom: detailDates[item.id] ?? null };
        };
  if (detailDates != null) {
    mockStore.setUserSettings({ provider_details: [providerId] });
  }

  const Fredy = await mockFredy();
  const fredy = new Fredy(
    {
      url: 'http://example.com',
      getListings: () => Promise.resolve(listings),
      normalize: (l) => l,
      filter: () => true,
      fetchDetails,
      crawlFields: { id: 'id', title: 'title', address: 'address', price: 'price' },
      requiredFieldNames: ['id', 'title', 'address', 'price'],
    },
    { id: `job-${providerId}`, notificationAdapter: null, specFilter, spatialFilter: null },
    providerId,
    { checkAndAddEntry: () => false },
    undefined,
    // Every listing through the detail fetch, not just the first one the provider suites need.
    { maxDetailFetches: null },
  );
  await fredy.execute();
  return {
    notified: (getLastNotification()?.payload ?? []).map((entry) => entry.id),
    deleted: [...mockStore.deletedIds],
    detailed,
  };
}

const WINDOW = { moveInEarliest: '2026-10-01', moveInLatest: '2026-12-31' };

describe("applying a job's move-in window", () => {
  beforeEach(() => {
    mockStore.deletedIds.length = 0;
    resetNotifications();
  });

  afterEach(() => {
    mockStore.setUserSettings(null);
  });

  it('drops a date the search page stated before anything is fetched or stored for it', async () => {
    const { notified, deleted, detailed } = await run({
      providerId: 'movein-search-page',
      specFilter: WINDOW,
      listings: [listing('early', '2026-09-30'), listing('inside', '2026-10-01'), listing('late', '2027-01-01')],
      detailDates: {},
    });

    expect(notified).toEqual(['inside']);
    // Never stored, so there is no row to soft-delete, and the exposé was never asked for.
    expect(deleted).toEqual([]);
    expect(detailed).toEqual(['inside']);
  });

  it('keeps a listing that states no date, which is what most portals do', async () => {
    const { notified, deleted } = await run({
      providerId: 'movein-undated',
      specFilter: WINDOW,
      listings: [listing('undated'), listing('null-date', null), listing('inside', '2026-11-15')],
    });

    expect(notified).toEqual(['undated', 'null-date', 'inside']);
    expect(deleted).toEqual([]);
  });

  it('judges a date only the exposé states once it has been read, and keeps the row as a tombstone', async () => {
    const { notified, deleted, detailed } = await run({
      providerId: 'movein-exposé',
      specFilter: WINDOW,
      listings: [listing('early'), listing('inside'), listing('silent')],
      detailDates: { early: '2026-08-01', inside: '2026-12-31', silent: null },
    });

    expect(detailed).toEqual(['early', 'inside', 'silent']);
    expect(notified).toEqual(['inside', 'silent']);
    // Soft-deleted rather than dropped: the stored row is what stops the next run from fetching the
    // same exposé again only to reach the same verdict.
    expect(deleted).toEqual(['early']);
  });

  it('leaves out the listings without a date only when the job asks for it, after the exposé had its chance', async () => {
    const { notified, deleted, detailed } = await run({
      providerId: 'movein-required',
      specFilter: { ...WINDOW, moveInDateRequired: true },
      listings: [listing('silent'), listing('dated-in-exposé')],
      detailDates: { 'dated-in-exposé': '2026-10-15' },
    });

    // Neither was dropped early: the exposé might still have named a date.
    expect(detailed).toEqual(['silent', 'dated-in-exposé']);
    expect(notified).toEqual(['dated-in-exposé']);
    expect(deleted).toEqual(['silent']);
  });

  it('honours an open end', async () => {
    const { notified } = await run({
      providerId: 'movein-open-end',
      specFilter: { moveInEarliest: '2026-10-01' },
      listings: [listing('early', '2026-09-01'), listing('much-later', '2030-01-01')],
    });

    expect(notified).toEqual(['much-later']);
  });

  it('changes nothing for a job without a window, whatever else its spec filter says', async () => {
    const { notified, deleted } = await run({
      providerId: 'movein-none',
      // The flag without a date, and a date the form could never have produced.
      specFilter: { moveInDateRequired: true, moveInEarliest: 'next week' },
      listings: [listing('undated'), listing('dated', '2020-01-01')],
    });

    expect(notified).toEqual(['undated', 'dated']);
    expect(deleted).toEqual([]);
  });
});
