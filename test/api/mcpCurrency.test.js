/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('../../lib/services/storage/listingsStorage.js', () => ({
  queryListings: vi.fn(() => ({ totalNumber: 0, page: 1, result: [] })),
  getListingById: vi.fn(),
  setListingNotes: vi.fn(() => 1),
}));
vi.mock('../../lib/services/storage/watchListStorage.js', () => ({
  ensureWatch: vi.fn(() => ({ watched: true })),
  deleteWatch: vi.fn(() => ({ deleted: true })),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/services/storage/settingsStorage.js', () => ({ getUserSettings: vi.fn(() => ({})) }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById, queryListings } from '../../lib/services/storage/listingsStorage.js';
import { getUserSettings } from '../../lib/services/storage/settingsStorage.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';
import { normalizeGetListing, normalizeListListings } from '../../lib/mcp/mcpNormalizer.js';

/**
 * Prices over MCP name their currency.
 *
 * An assistant reading a bare `2710` next to a bare `1200` has no reason to think they are not the
 * same kind of number, so every price goes out with its ISO code, a price bound only ever applies
 * in one currency, and the euro-only finance model refuses a price in any other.
 */

const textOf = (result) => result.content.map((part) => part.text).join('\n');

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

describe('listings over MCP', () => {
  it('print each price with the code of its currency', () => {
    const md = textOf(
      normalizeListListings(
        {
          totalNumber: 2,
          page: 1,
          result: [
            { id: 'zh', title: 'Zürich', price: 2710, currency: 'CHF', dealType: 'rent' },
            { id: 'k', title: 'Köln', price: 1200, dealType: 'rent' },
          ],
        },
        { page: 1, pageSize: 50 },
      ),
    );
    expect(md).toContain('| 2710 CHF |');
    // A row from before currencies existed reads as what it was taken to be.
    expect(md).toContain('| 1200 EUR |');
  });

  it('print the price of a single listing with its currency', () => {
    const md = textOf(
      normalizeGetListing({ id: 'zh', title: 'Zürich', price: 2710, currency: 'CHF', dealType: 'rent' }),
    );
    expect(md).toContain('- **Price:** 2710 CHF (monthly rent)');
    expect(textOf(normalizeGetListing({ id: 'n', title: 'No price', price: null }))).toContain('- **Price:** –');
  });
});

describe('list_listings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hands the currency through to the query, which bounds prices in it', async () => {
    await callTool('list_listings', { maxPrice: 2000, currency: 'CHF' });
    expect(queryListings).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: 2000, currencyFilter: 'CHF' }));
  });

  it('leaves the currency open when none is asked for', async () => {
    await callTool('list_listings', {});
    expect(queryListings).toHaveBeenCalledWith(expect.objectContaining({ currencyFilter: null }));
  });

  it('refuses a currency that is not a three-letter code', async () => {
    const result = await callTool('list_listings', { currency: 'Franken' });
    expect(result.isError).toBe(true);
    expect(queryListings).not.toHaveBeenCalled();
  });
});

describe('calculate_financing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSettings.mockReturnValue({
      finance_profile: {
        personA: { label: 'A', enabled: true, age: 34, primaryIncome: 4000, secondaryIncome: 0 },
        livingCosts: 1400,
      },
    });
  });

  // The model lends and budgets in euros; a verdict on a franc price would be one on a wrong number.
  it('refuses a listing priced in another currency', async () => {
    getListingById.mockReturnValue({ id: 'zh', title: 'Zürich', price: 2710, currency: 'CHF', dealType: 'rent' });

    const md = textOf(await callTool('calculate_financing', { listingId: 'zh' }));

    expect(md).toContain('priced in CHF');
    expect(md).not.toContain('Verdict');
  });
});
