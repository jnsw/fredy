/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Everything the listings route pulls in is mocked, so this suite exercises how `/map` reads its
// request and nothing else. What the resulting filter then matches in the database is
// test/services/storage/listingsStorage.mapFilters.test.js.
vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getAvailableProviders: vi.fn(() => []),
  getListingsForMap: vi.fn(() => ({ listings: [] })),
  getListingById: vi.fn(() => null),
  deleteListingsByFilter: vi.fn(() => ({ changes: 0 })),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  toggleWatch: vi.fn(),
  ensureWatch: vi.fn(),
}));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: vi.fn((id) => (id === 'job-1' ? { id: 'job-1', name: 'Berlin' } : null)),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import { getListingsForMap, queryListings } from '../../lib/services/storage/listingsStorage.js';
import { isAdmin } from '../../lib/api/security.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';
import { filterMask } from '../../lib/services/connectivity/mobileBits.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
  });
  await app.register(listingsPlugin);
  await app.ready();
  return app;
}

/** What the route handed the storage layer on its last call. */
const lastFilters = () => getListingsForMap.mock.calls.at(-1)[0];

/**
 * @param {string} path
 * @returns {Promise<import('light-my-request').Response>}
 */
const get = async (path) => (await buildApp()).inject({ method: 'GET', url: path });

/** The query string the overview and the map both send for the same filters. */
const QUERY =
  'jobNameFilter=job-1&providerFilter=immoscout&activityFilter=true&watchListFilter=true&statusFilter=applied' +
  '&travelTimeMode=transit&travelTimeMaxMinutes=30&connectivityMinDown=250&connectivityFiber=true' +
  '&connectivityMobileTech=5g&connectivityMobileOperator=dt';

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin.mockReturnValue(false);
});

describe('GET /map', () => {
  it('answers with what the storage layer found', async () => {
    getListingsForMap.mockReturnValue({ listings: [{ id: 'a' }] });

    const response = await get('/map');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ listings: [{ id: 'a' }] });
  });

  it('reads the overview’s filters exactly as the overview’s own page does', async () => {
    await get(`/map?${QUERY}`);
    await get(`/table?${QUERY}`);

    // Everything but the paging and the sort, which belong to the page of listings alone.
    const tableFilters = { ...queryListings.mock.calls.at(-1)[0] };
    for (const key of ['page', 'pageSize', 'sortField', 'sortDir']) {
      delete tableFilters[key];
    }
    expect(lastFilters()).toEqual(tableFilters);
    expect(lastFilters()).toMatchObject({
      jobIdFilter: 'job-1',
      providerFilter: 'immoscout',
      activityFilter: true,
      watchListFilter: true,
      statusFilter: 'applied',
      travelTimeFilter: { mode: 'transit', maxMinutes: 30, label: null },
      connectivityMinDown: 250,
      connectivityFiberOnly: true,
      connectivityMobileMask: filterMask('5g', 'dt'),
    });
  });

  it('scopes the pins to the session user', async () => {
    await get('/map');
    expect(lastFilters()).toMatchObject({ userId: 'user-1', isAdmin: false });

    isAdmin.mockReturnValue(true);
    await get('/map');
    expect(lastFilters().isAdmin).toBe(true);
  });

  it('drops what the overview would drop, rather than trusting the query string', async () => {
    await get(`/map?statusFilter=${encodeURIComponent("' OR 1=1 --")}&travelTimeMode=teleport&travelTimeMaxMinutes=30`);

    expect(lastFilters().statusFilter).toBeUndefined();
    expect(lastFilters().travelTimeFilter).toBeNull();
  });

  it('answers "all" for the activity filter the way the overview does, by leaving it out', async () => {
    await get('/map');
    expect(lastFilters().activityFilter).toBeNull();

    await get('/map?activityFilter=false');
    expect(lastFilters().activityFilter).toBe(false);
  });
});
