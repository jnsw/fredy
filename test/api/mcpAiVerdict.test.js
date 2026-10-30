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
  setListingAiVerdict: vi.fn(() => 1),
}));
vi.mock('../../lib/services/tracking/Tracker.js', () => ({ trackPoi: vi.fn() }));
vi.mock('../../lib/mcp/mcpAuthentication.js', () => ({
  authenticateToolCall: vi.fn(() => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  authenticateWriteToolCall: vi.fn(async () => ({ user: { id: 'u1', isAdmin: false }, error: null })),
  checkJobAccess: vi.fn(() => true),
}));

import { getListingById, queryListings, setListingAiVerdict } from '../../lib/services/storage/listingsStorage.js';
import { authenticateWriteToolCall } from '../../lib/mcp/mcpAuthentication.js';
import { createMcpServer } from '../../lib/mcp/mcpAdapter.js';

async function callTool(name, args) {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const result = await client.callTool({ name, arguments: args });
  await client.close();
  return result;
}

const textOf = (result) => result.content.map((part) => part.text).join('\n');

const listing = (overrides = {}) => ({ id: 'l1', title: 'Nice flat', created_at: 0, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  authenticateWriteToolCall.mockImplementation(async () => ({ user: { id: 'u1', isAdmin: false }, error: null }));
  getListingById.mockReturnValue(listing());
  setListingAiVerdict.mockReturnValue(1);
});

describe('set_listing_ai_verdict', () => {
  it('stores the verdict with its reasoning and names MCP as the source', async () => {
    const result = await callTool('set_listing_ai_verdict', {
      listingId: 'l1',
      verdict: 'good',
      reason: 'Balcony, quiet street, rent 15 % under the local median.',
    });

    expect(result.isError).toBeUndefined();
    expect(setListingAiVerdict).toHaveBeenCalledWith('l1', {
      verdict: 'good',
      reason: 'Balcony, quiet street, rent 15 % under the local median.',
      source: 'mcp',
    });
    expect(textOf(result)).toContain('GOOD');
  });

  it('clears the verdict on "none"', async () => {
    const result = await callTool('set_listing_ai_verdict', { listingId: 'l1', verdict: 'none', reason: 'ignored' });

    expect(setListingAiVerdict).toHaveBeenCalledWith('l1', null);
    expect(textOf(result)).toContain('AI verdict cleared.');
  });

  it('refuses a listing the user cannot see, and writes nothing', async () => {
    getListingById.mockReturnValue(null);

    const result = await callTool('set_listing_ai_verdict', { listingId: 'someone-elses', verdict: 'bad' });

    expect(result.isError).toBe(true);
    expect(setListingAiVerdict).not.toHaveBeenCalled();
  });

  it('goes through the write authentication, so the mcp:write scope and demo mode apply', async () => {
    authenticateWriteToolCall.mockImplementation(async () => ({ user: null, error: 'Missing scope mcp:write.' }));

    const result = await callTool('set_listing_ai_verdict', { listingId: 'l1', verdict: 'bad' });

    expect(result.isError).toBe(true);
    expect(getListingById).not.toHaveBeenCalled();
    expect(setListingAiVerdict).not.toHaveBeenCalled();
  });

  it('rejects anything that is not one of the three verdicts', async () => {
    const result = await callTool('set_listing_ai_verdict', { listingId: 'l1', verdict: 'excellent' });

    expect(result.isError).toBe(true);
    expect(setListingAiVerdict).not.toHaveBeenCalled();
  });
});

describe('reading the verdict over MCP', () => {
  it('shows verdict, reasoning, model and date on get_listing', async () => {
    getListingById.mockReturnValue(
      listing({
        ai_verdict: 'maybe',
        ai_verdict_reason: 'Nice flat, but the rent is above the local median.',
        ai_verdict_source: 'claude-opus-5-5',
        ai_verdict_at: Date.UTC(2026, 9, 1, 12, 0, 0),
      }),
    );

    const text = textOf(await callTool('get_listing', { listingId: 'l1' }));

    expect(text).toContain('**AI verdict:** MAYBE (claude-opus-5-5, 2026-10-01 12:00:00)');
    expect(text).toContain('**AI reasoning:** Nice flat, but the rent is above the local median.');
  });

  it('says "not rated" rather than leaving the line out', async () => {
    const text = textOf(await callTool('get_listing', { listingId: 'l1' }));
    expect(text).toContain('**AI verdict:** not rated');
  });

  it('passes the aiVerdict filter of list_listings through to the query', async () => {
    queryListings.mockReturnValue({
      totalNumber: 1,
      page: 1,
      result: [listing({ ai_verdict: 'good', is_active: 1 })],
    });

    const text = textOf(await callTool('list_listings', { aiVerdict: 'good' }));

    expect(queryListings).toHaveBeenCalledWith(expect.objectContaining({ aiVerdictFilter: 'good' }));
    expect(text).toContain('| AI |');
    expect(text).toContain('| GOOD |');
  });
});
