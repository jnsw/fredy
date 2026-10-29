/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/markdown.js', () => ({ readAdapterReadme: () => '' }));

import { send, sendPriceChange } from '../../lib/notification/adapter/http.js';
import { formatListing, formatPriceChange } from '../../lib/utils/formatListing.js';

/**
 * The http adapter hands listings to a machine. The price arrives formatted in the listing's
 * currency, and the ISO code rides along beside it so a receiver does not have to parse it back out
 * of the string.
 */
describe('http adapter, currency', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const notificationConfig = [{ id: 'http', fields: { endpointUrl: 'https://receiver.example/hook' } }];
  const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it('sends the formatted price and the code of its currency', async () => {
    const listing = formatListing({ id: 'zh', title: 'Wohnung', price: 2710, currency: 'CHF', link: 'https://x/zh' });
    await send({ serviceName: 'flatfox', newListings: [listing], notificationConfig, jobKey: 'job', baseUrl: '' });

    const [sent] = bodyOf().listings;
    expect(sent.price).toBe('2.710 CHF');
    expect(sent.currency).toBe('CHF');
  });

  it('leaves the field out for a listing that never had one, as before', async () => {
    const listing = formatListing({ id: 'k', title: 'Flat', price: 1200, link: 'https://x/k' });
    await send({ serviceName: 'immoscout', newListings: [listing], notificationConfig, jobKey: 'job', baseUrl: '' });

    const [sent] = bodyOf().listings;
    expect(sent.price).toBe('1.200 €');
    expect(sent).not.toHaveProperty('currency');
  });

  it('quotes a price change in the currency of the listing', async () => {
    const change = formatPriceChange({
      listing: { id: 'zh', title: 'Wohnung', price: 2500, currency: 'CHF', link: 'https://x/zh' },
      oldPrice: 2710,
      newPrice: 2500,
      changePercent: -7.75,
      direction: 'down',
    });
    await sendPriceChange({
      serviceName: 'flatfox',
      priceChanges: [change],
      notificationConfig,
      jobKey: 'job',
      baseUrl: '',
    });

    const [sent] = bodyOf().priceChanges;
    expect(sent.oldPrice).toBe('2.710 CHF');
    expect(sent.newPrice).toBe('2.500 CHF');
    expect(sent.currency).toBe('CHF');
  });
});
