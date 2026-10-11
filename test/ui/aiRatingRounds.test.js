/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

import { rateInRounds } from '../../ui/src/services/listings/aiRatingRounds.js';

describe('rateInRounds', () => {
  const rated = (id) => ({ results: [{ listingId: id, status: 'rated', verdict: 'good' }], stopped: null });

  it('sends one listing per request and counts up as it goes', async () => {
    const rate = vi.fn(async ([id]) => rated(id));
    const progress = [];

    const summary = await rateInRounds(['a', 'b', 'c'], rate, (p) => progress.push(p));

    expect(rate.mock.calls).toEqual([[['a']], [['b']], [['c']]]);
    expect(progress).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
    expect(summary).toEqual({ rated: 3, failed: 0, stopped: null });
  });

  it('counts a listing the model could not rate and carries on', async () => {
    const rate = vi.fn(async ([id]) =>
      id === 'b' ? { results: [{ listingId: id, status: 'failed', kind: 'listing' }], stopped: null } : rated(id),
    );

    expect(await rateInRounds(['a', 'b', 'c'], rate)).toEqual({ rated: 2, failed: 1, stopped: null });
  });

  it('stops at a failure about the key, without sending the rest', async () => {
    const stopped = { kind: 'auth', message: 'invalid x-api-key' };
    const rate = vi.fn(async ([id]) => ({ results: [{ listingId: id, status: 'failed', kind: 'auth' }], stopped }));

    const summary = await rateInRounds(['a', 'b', 'c'], rate);

    expect(rate).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ rated: 0, failed: 1, stopped });
  });
});
