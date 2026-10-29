/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: vi.fn(() => true),
  setListingStatus: vi.fn(() => 1),
  setListingAppointment: vi.fn(() => true),
  getViewings: vi.fn(() => []),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({ toggleWatch: vi.fn(), ensureWatch: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn() }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/geocoding/distanceService.js', () => ({ updateDistancesForListing: vi.fn() }));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import * as listingStorage from '../../lib/services/storage/listingsStorage.js';
import { ensureWatch } from '../../lib/services/storage/watchListStorage.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';
import { normalizeListingFilters } from '../../lib/api/listingFilterQuery.js';

async function buildApp() {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    request.session = { currentUser: 'user-1' };
    request.currentUser = { id: 'user-1' };
  });
  await app.register(listingsPlugin);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  listingStorage.userCanAccessListing.mockReturnValue(true);
  listingStorage.setListingStatus.mockReturnValue(1);
  listingStorage.setListingAppointment.mockReturnValue(true);
  listingStorage.getViewings.mockReturnValue([]);
});

describe('POST /:listingId/status', () => {
  it.each(['documents_sent', 'invited', 'visited', 'not_invited'])(
    'accepts the stage %s and watches the listing',
    async (status) => {
      const app = await buildApp();

      const response = await app.inject({ method: 'POST', url: '/listing-1/status', payload: { status } });

      expect(response.statusCode).toBe(200);
      expect(listingStorage.setListingStatus).toHaveBeenCalledWith('listing-1', status);
      expect(ensureWatch).toHaveBeenCalledWith('listing-1', 'user-1');
    },
  );

  it('still refuses a status that does not exist', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'POST', url: '/listing-1/status', payload: { status: 'maybe' } });

    expect(response.statusCode).toBe(400);
    expect(listingStorage.setListingStatus).not.toHaveBeenCalled();
  });
});

describe('POST /:listingId/appointment', () => {
  it('stores the appointment of a listing the user can see', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/listing-1/appointment',
      payload: { appointmentAt: 1_790_000_000_000 },
    });

    expect(response.json()).toEqual({ appointmentAt: 1_790_000_000_000 });
    expect(listingStorage.setListingAppointment).toHaveBeenCalledWith('listing-1', 1_790_000_000_000);
  });

  it('clears it with null', async () => {
    const app = await buildApp();

    await app.inject({ method: 'POST', url: '/listing-1/appointment', payload: { appointmentAt: null } });

    expect(listingStorage.setListingAppointment).toHaveBeenCalledWith('listing-1', null);
  });

  it('refuses garbage, foreign listings and listings without a viewing', async () => {
    const app = await buildApp();

    const garbage = await app.inject({ method: 'POST', url: '/l/appointment', payload: { appointmentAt: 'soon' } });
    listingStorage.userCanAccessListing.mockReturnValueOnce(false);
    const foreign = await app.inject({ method: 'POST', url: '/l/appointment', payload: { appointmentAt: 5 } });
    listingStorage.setListingAppointment.mockReturnValueOnce(false);
    const notInvited = await app.inject({ method: 'POST', url: '/l/appointment', payload: { appointmentAt: 5 } });

    expect(garbage.statusCode).toBe(400);
    expect(foreign.statusCode).toBe(403);
    expect(notInvited.statusCode).toBe(409);
  });
});

describe('GET /viewings', () => {
  it('answers with the viewings of the signed-in user, not a listing called "viewings"', async () => {
    listingStorage.getViewings.mockReturnValue([{ id: 'listing-1', appointmentAt: 5 }]);
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/viewings' });

    expect(response.json()).toEqual({ viewings: [{ id: 'listing-1', appointmentAt: 5 }] });
    expect(listingStorage.getViewings).toHaveBeenCalledWith('user-1');
  });
});

describe('the listing filter', () => {
  it('passes the new stages through and drops the unknown', () => {
    const statusOf = (statusFilter) =>
      normalizeListingFilters({ statusFilter }, { userId: 'user-1' }).filters.statusFilter;

    expect(statusOf('invited')).toBe('invited');
    expect(statusOf('NOT_INVITED')).toBe('not_invited');
    expect(statusOf('bogus')).toBeUndefined();
  });
});
