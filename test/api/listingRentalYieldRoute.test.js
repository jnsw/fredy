/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  userCanAccessListing: vi.fn(() => true),
  getListingById: vi.fn(),
  setColdRentOverride: vi.fn(() => 1),
  queryListings: vi.fn(),
  getListingsForMap: vi.fn(),
  getPriceHistory: vi.fn(),
  setListingNotes: vi.fn(),
  setListingStatus: vi.fn(),
  deleteListingsByJobId: vi.fn(),
  deleteListingsById: vi.fn(),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({ toggleWatch: vi.fn(), ensureWatch: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: vi.fn(() => ({ id: 'job-1', userId: 'user-1' })),
}));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({})),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/api/security.js', () => ({ isAdmin: vi.fn(() => false) }));

import * as listingStorage from '../../lib/services/storage/listingsStorage.js';
import { getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import listingsPlugin from '../../lib/api/routes/listingsRouter.js';

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

/** A 60 m² flat for 200.000 EUR in an area that lets at 10 EUR/m². */
const purchase = (overrides = {}) => ({
  id: 'listing-1',
  job_id: 'job-1',
  dealType: 'buy',
  price: 200000,
  size: 60,
  rent_median_sqm: 10,
  rent_sample_size: 12,
  rent_radius_km: 5,
  cold_rent_override: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  listingStorage.getListingById.mockReturnValue(purchase());
  listingStorage.setColdRentOverride.mockReturnValue(1);
  getUserSettings.mockReturnValue({});
});

describe('GET /:listingId', () => {
  it('attaches the rental yield of a purchase', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/listing-1' });

    expect(response.statusCode).toBe(200);
    expect(response.json().rentalYield).toMatchObject({
      grossYield: 3.6,
      priceFactor: 27.8,
      coldRent: { monthly: 600, source: 'estimate', sampleSize: 12, radiusKm: 5 },
    });
  });

  // An untouched profile still has its defaults, which is what the financing card assumes as well.
  it('computes the net yield with the Kaufnebenkosten of the finance profile', async () => {
    getUserSettings.mockReturnValue({ finance_profile: { financing: { bundesland: 'BY' } } });
    const app = await buildApp();

    const { rentalYield } = (await app.inject({ method: 'GET', url: '/listing-1' })).json();

    expect(rentalYield.bundesland).toBe('BY');
    expect(rentalYield.closingCostsPct).toBe(8.57);
  });

  it('attaches nothing to a purchase without a rent to start from', async () => {
    listingStorage.getListingById.mockReturnValue(purchase({ rent_median_sqm: null }));
    const app = await buildApp();

    expect((await app.inject({ method: 'GET', url: '/listing-1' })).json().rentalYield).toBeNull();
  });

  it('leaves rentals without a yield', async () => {
    listingStorage.getListingById.mockReturnValue(purchase({ dealType: 'rent', price: 900 }));
    const app = await buildApp();

    expect((await app.inject({ method: 'GET', url: '/listing-1' })).json().rentalYield).toBeNull();
  });
});

describe('POST /:listingId/cold-rent', () => {
  const post = async (body) => {
    const app = await buildApp();
    return app.inject({ method: 'POST', url: '/listing-1/cold-rent', payload: body });
  };

  it('stores the monthly cold rent', async () => {
    const response = await post({ coldRent: 850 });

    expect(response.statusCode).toBe(200);
    expect(listingStorage.setColdRentOverride).toHaveBeenCalledWith('listing-1', 850);
  });

  it('hands the listing back to the estimate on null', async () => {
    const response = await post({ coldRent: null });

    expect(response.statusCode).toBe(200);
    expect(listingStorage.setColdRentOverride).toHaveBeenCalledWith('listing-1', null);
  });

  it('refuses anything that is not a plausible monthly rent', async () => {
    for (const coldRent of [0, -5, 'abc', 100001]) {
      expect((await post({ coldRent })).statusCode).toBe(400);
    }
    expect(listingStorage.setColdRentOverride).not.toHaveBeenCalled();
  });

  // A rental's rent is its price. Rentals stay exactly as they were.
  it('refuses a rental', async () => {
    listingStorage.getListingById.mockReturnValue(purchase({ dealType: 'rent' }));

    expect((await post({ coldRent: 850 })).statusCode).toBe(400);
    expect(listingStorage.setColdRentOverride).not.toHaveBeenCalled();
  });

  it('refuses a listing the caller cannot see', async () => {
    listingStorage.getListingById.mockReturnValue(null);

    expect((await post({ coldRent: 850 })).statusCode).toBe(403);
    expect(listingStorage.setColdRentOverride).not.toHaveBeenCalled();
  });
});
