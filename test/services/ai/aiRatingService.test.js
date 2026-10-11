/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  countAiRatingsSince: vi.fn(() => 0),
  getListingsDueForAiRating: vi.fn(() => []),
  recordAiRatingFailure: vi.fn(),
  setListingAiVerdict: vi.fn(() => 1),
}));
vi.mock('../../../lib/services/storage/aiRatingSettingsStorage.js', () => ({
  PAUSED_UNTIL_SAVED: Number.MAX_SAFE_INTEGER,
  clearAiRatingPause: vi.fn(),
  getAutoRatingSettings: vi.fn(() => []),
  pauseAiRating: vi.fn(),
}));
vi.mock('../../../lib/services/storage/userStorage.js', () => ({
  getUser: vi.fn(() => ({ id: 'u1', isAdmin: false })),
}));
vi.mock('../../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: vi.fn(async () => ({ demoMode: false })),
  getUserSettings: vi.fn(() => ({ language: 'de' })),
}));
vi.mock('../../../lib/services/logger.js', () => ({ default: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/services/ai/listingRater.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, rateListing: vi.fn() };
});

import * as listingsStorage from '../../../lib/services/storage/listingsStorage.js';
import * as settingsStorage from '../../../lib/services/storage/aiRatingSettingsStorage.js';
import { getUser } from '../../../lib/services/storage/userStorage.js';
import { getSettings } from '../../../lib/services/storage/settingsStorage.js';
import { AiRatingError, rateListing } from '../../../lib/services/ai/listingRater.js';
import {
  AI_RATING_LIMIT_PER_RUN,
  RATE_LIMIT_BACKOFF_MS,
  UNAVAILABLE_BACKOFF_MS,
  rateAndStoreListing,
  runAiRatingSweep,
} from '../../../lib/services/ai/aiRatingService.js';

/**
 * The rules that keep the bill bounded, against a mocked rater: no model is ever called here.
 */

const SETTINGS = {
  userId: 'u1',
  provider: 'anthropic',
  apiKey: 'sk-ant-test',
  autoRate: true,
  autoRateSince: 1_000,
  dailyLimit: 50,
  pausedUntil: null,
  lastError: null,
};

const RATED = { verdict: 'good', reason: 'Quiet, bright, fair price.', source: 'claude-opus-5-5' };

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ demoMode: false });
  getUser.mockReturnValue({ id: 'u1', isAdmin: false });
  rateListing.mockResolvedValue(RATED);
  settingsStorage.getAutoRatingSettings.mockReturnValue([]);
  listingsStorage.getListingsDueForAiRating.mockReturnValue([]);
  listingsStorage.countAiRatingsSince.mockReturnValue(0);
});

describe('rateAndStoreListing', () => {
  it('stores the verdict and passes language and admin rights to the rater', async () => {
    getUser.mockReturnValue({ id: 'u1', isAdmin: true });

    const outcome = await rateAndStoreListing({ id: 'l1' }, SETTINGS);

    expect(outcome).toEqual({ status: 'rated', ...RATED });
    expect(listingsStorage.setListingAiVerdict).toHaveBeenCalledWith('l1', RATED);
    expect(rateListing).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'de', allowPrivateBaseUrl: true, settings: SETTINGS }),
    );
  });

  it('counts a listing-level failure against the listing and leaves the settings alone', async () => {
    rateListing.mockRejectedValue(new AiRatingError('listing', 'declined'));

    const outcome = await rateAndStoreListing({ id: 'l1' }, SETTINGS);

    expect(outcome).toMatchObject({ status: 'failed', kind: 'listing' });
    expect(listingsStorage.recordAiRatingFailure).toHaveBeenCalledWith('l1');
    expect(settingsStorage.pauseAiRating).not.toHaveBeenCalled();
  });

  it('pauses until the user saves again when the key is rejected', async () => {
    rateListing.mockRejectedValue(new AiRatingError('auth', 'invalid x-api-key'));

    await rateAndStoreListing({ id: 'l1' }, SETTINGS);

    expect(settingsStorage.pauseAiRating).toHaveBeenCalledWith('u1', Number.MAX_SAFE_INTEGER, 'invalid x-api-key');
    expect(listingsStorage.recordAiRatingFailure).not.toHaveBeenCalled();
  });

  it('waits out a rate limit, for at least the default backoff and longer when asked', async () => {
    const before = Date.now();
    rateListing.mockRejectedValue(new AiRatingError('rateLimit', 'slow down', { retryAfterMs: 3_600_000 }));
    await rateAndStoreListing({ id: 'l1' }, SETTINGS);
    expect(settingsStorage.pauseAiRating.mock.calls[0][1]).toBeGreaterThanOrEqual(before + 3_600_000);

    rateListing.mockRejectedValue(new AiRatingError('rateLimit', 'slow down', { retryAfterMs: 1_000 }));
    await rateAndStoreListing({ id: 'l1' }, SETTINGS);
    expect(settingsStorage.pauseAiRating.mock.calls[1][1]).toBeGreaterThanOrEqual(before + RATE_LIMIT_BACKOFF_MS);
  });

  it('backs off after an outage', async () => {
    const before = Date.now();
    rateListing.mockRejectedValue(new AiRatingError('unavailable', 'overloaded'));
    await rateAndStoreListing({ id: 'l1' }, SETTINGS);
    expect(settingsStorage.pauseAiRating.mock.calls[0][1]).toBeGreaterThanOrEqual(before + UNAVAILABLE_BACKOFF_MS);
  });

  it('lifts an earlier pause once a rating goes through', async () => {
    await rateAndStoreListing({ id: 'l1' }, { ...SETTINGS, lastError: 'Overloaded', pausedUntil: 5 });
    expect(settingsStorage.clearAiRatingPause).toHaveBeenCalledWith('u1');
  });
});

describe('runAiRatingSweep', () => {
  const listings = (count) => Array.from({ length: count }, (_, i) => ({ id: `l${i}` }));

  it('does nothing at all when nobody switched it on', async () => {
    const { rated } = await runAiRatingSweep();

    expect(rated).toBe(0);
    expect(listingsStorage.getListingsDueForAiRating).not.toHaveBeenCalled();
    expect(rateListing).not.toHaveBeenCalled();
  });

  it('never runs on a demo instance', async () => {
    getSettings.mockResolvedValue({ demoMode: true });
    settingsStorage.getAutoRatingSettings.mockReturnValue([SETTINGS]);

    await runAiRatingSweep();

    expect(settingsStorage.getAutoRatingSettings).not.toHaveBeenCalled();
    expect(rateListing).not.toHaveBeenCalled();
  });

  it('asks only for new listings, capped per run', async () => {
    settingsStorage.getAutoRatingSettings.mockReturnValue([SETTINGS]);
    listingsStorage.getListingsDueForAiRating.mockReturnValue(listings(3));

    const { rated } = await runAiRatingSweep({ now: 10_000 });

    expect(listingsStorage.getListingsDueForAiRating).toHaveBeenCalledWith({
      userId: 'u1',
      since: 1_000,
      limit: AI_RATING_LIMIT_PER_RUN,
    });
    expect(rated).toBe(3);
  });

  it('holds the run to what is left of the daily limit, and skips a user who used it up', async () => {
    settingsStorage.getAutoRatingSettings.mockReturnValue([{ ...SETTINGS, dailyLimit: 10 }]);
    listingsStorage.countAiRatingsSince.mockReturnValue(7);

    await runAiRatingSweep({ now: 10_000 });
    expect(listingsStorage.getListingsDueForAiRating).toHaveBeenCalledWith(expect.objectContaining({ limit: 3 }));

    vi.clearAllMocks();
    listingsStorage.countAiRatingsSince.mockReturnValue(10);
    settingsStorage.getAutoRatingSettings.mockReturnValue([{ ...SETTINGS, dailyLimit: 10 }]);
    await runAiRatingSweep({ now: 10_000 });
    expect(listingsStorage.getListingsDueForAiRating).not.toHaveBeenCalled();
  });

  it('carries on past a listing that fails, but stops at a failure that is about the account', async () => {
    settingsStorage.getAutoRatingSettings.mockReturnValue([SETTINGS]);
    listingsStorage.getListingsDueForAiRating.mockReturnValue(listings(4));
    rateListing
      .mockRejectedValueOnce(new AiRatingError('listing', 'declined'))
      .mockResolvedValueOnce(RATED)
      .mockRejectedValueOnce(new AiRatingError('rateLimit', 'slow down'))
      .mockResolvedValueOnce(RATED);

    const { rated } = await runAiRatingSweep();

    expect(rateListing).toHaveBeenCalledTimes(3);
    expect(rated).toBe(1);
  });

  it("keeps going for the next user when one user's run breaks", async () => {
    settingsStorage.getAutoRatingSettings.mockReturnValue([SETTINGS, { ...SETTINGS, userId: 'u2' }]);
    listingsStorage.countAiRatingsSince.mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    listingsStorage.getListingsDueForAiRating.mockReturnValue(listings(1));

    const { rated } = await runAiRatingSweep();

    expect(rated).toBe(1);
  });
});
