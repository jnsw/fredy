/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/services/storage/jobStorage.js', () => ({ getJob: vi.fn(() => null) }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getUserSettings: vi.fn(() => ({})) }));

import { normalizeListingFilters } from '../../lib/api/listingFilterQuery.js';

/**
 * The overview's `/table` and the bulk delete both read the AI verdict filter through here, so the
 * set the page shows and the set the delete removes cannot disagree about it.
 */
describe('normalizeListingFilters - AI verdict', () => {
  const filterOf = (aiVerdictFilter) =>
    normalizeListingFilters({ aiVerdictFilter }, { userId: 'u1' }).filters.aiVerdictFilter;

  it('passes the three verdicts and "none" through, lowercased', () => {
    expect(filterOf('good')).toBe('good');
    expect(filterOf('MAYBE')).toBe('maybe');
    expect(filterOf('bad')).toBe('bad');
    expect(filterOf('none')).toBe('none');
  });

  it('drops anything else instead of passing it on to the query', () => {
    expect(filterOf('excellent')).toBeNull();
    expect(filterOf(undefined)).toBeNull();
    expect(filterOf(['good'])).toBeNull();
  });
});
