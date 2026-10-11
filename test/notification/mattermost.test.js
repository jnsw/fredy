/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external deps BEFORE importing the module under test.
vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/storage/jobStorage.js', () => ({
  getJob: (jobKey) => ({ id: jobKey, name: `Job ${jobKey}` }),
}));
vi.mock('../../lib/services/markdown.js', () => ({
  readAdapterReadme: () => '',
}));

let mockNodeFetch;
let mattermost;

const listing = {
  id: '42',
  title: 'Flat',
  link: 'https://example.com/a',
  address: 'Berlin',
  price: '800 €',
  size: '50 m²',
};

const notificationConfig = [
  { id: 'mattermost', fields: { webhook: 'https://mm.example.com/hooks/x', channel: 'flats' } },
];

/** @returns {string} the markdown text of the n-th message the adapter posted */
function postedText(n = 0) {
  const [, opts] = mockNodeFetch.mock.calls[n];
  return JSON.parse(opts.body).text;
}

/** @returns {string[]} the table rows of a posted message, without the header and the separator */
function tableRows(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2);
}

beforeEach(async () => {
  vi.resetModules();
  const nodeFetchMod = await import('node-fetch');
  mockNodeFetch = nodeFetchMod.default;
  mockNodeFetch.mockReset();
  mockNodeFetch.mockResolvedValue({ ok: true, status: 200 });

  mattermost = await import('../../lib/notification/adapter/mattermost.js');
});

describe('mattermost send()', () => {
  it('renders one table row per listing, with nothing between the rows', async () => {
    await mattermost.send({
      serviceName: 'immoscout',
      newListings: [listing, { ...listing, id: '43', title: 'Other', link: 'https://example.com/b' }],
      notificationConfig,
      jobKey: 'berlin',
    });

    const text = postedText();
    // Concatenating the bare array joined the rows with commas, so every row after the first started
    // with ",|" and Mattermost no longer read it as part of the table.
    expect(text).not.toContain(',|');
    expect(tableRows(text)).toEqual([
      '| [Flat](https://example.com/a) | Berlin | 50 m² | 800 € |',
      '| [Other](https://example.com/b) | Berlin | 50 m² | 800 € |',
    ]);
  });

  it('keeps a pipe in the title or the address from splitting the cell', async () => {
    await mattermost.send({
      serviceName: 'immoscout',
      newListings: [{ ...listing, title: 'Altbau | Balkon', address: 'Mitte | Berlin' }],
      notificationConfig,
      jobKey: 'berlin',
      baseUrl: 'https://fredy.local',
    });

    expect(tableRows(postedText())).toEqual([
      '| [Altbau / Balkon](https://example.com/a) | Mitte / Berlin | 50 m² | 800 € | [Open in Fredy](https://fredy.local/#/listings/listing/42) |',
    ]);
  });

  it('leaves the cell empty for a listing without a size or a price instead of throwing', async () => {
    await mattermost.send({
      serviceName: 'immoscout',
      newListings: [{ ...listing, size: null, price: null }],
      notificationConfig,
      jobKey: 'berlin',
    });

    expect(tableRows(postedText())).toEqual(['| [Flat](https://example.com/a) | Berlin |  |  |']);
  });
});

describe('mattermost sendPriceChange()', () => {
  it('keeps a pipe in the title or the address from splitting the cell', async () => {
    await mattermost.sendPriceChange({
      serviceName: 'immoscout',
      priceChanges: [
        {
          ...listing,
          title: 'Altbau | Balkon',
          address: 'Mitte | Berlin',
          changeHeadline: 'Price reduced',
          oldPrice: '900 €',
          newPrice: '800 €',
          changePercent: '-11.1 %',
          direction: 'down',
        },
      ],
      notificationConfig,
      jobKey: 'berlin',
    });

    const [row] = tableRows(postedText());
    expect(row.startsWith('| [Altbau / Balkon](https://example.com/a) | ')).toBe(true);
    expect(row.endsWith(' | Mitte / Berlin |')).toBe(true);
  });
});
