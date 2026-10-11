/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/services/markdown.js', () => ({
  readAdapterReadme: () => '',
}));

let http;
let mockFetch;

const listing = {
  id: '42',
  title: 'Flat',
  link: 'https://example.com/a',
  address: 'Berlin',
  price: '800 €',
  size: '50 m²',
};

const priceChange = {
  ...listing,
  changeHeadline: 'Price reduced',
  oldPrice: '900 €',
  newPrice: '800 €',
  changePercent: '-11.1 %',
  direction: 'down',
};

const notificationConfig = [{ id: 'http', fields: { endpointUrl: 'https://hook.example.com/fredy' } }];

/** Both entry points take the same arguments apart from the payload, so every case runs against both. */
const entryPoints = [
  ['send', () => http.send({ serviceName: 'immoscout', newListings: [listing], notificationConfig, jobKey: 'j' })],
  [
    'sendPriceChange',
    () =>
      http.sendPriceChange({ serviceName: 'immoscout', priceChanges: [priceChange], notificationConfig, jobKey: 'j' }),
  ],
];

beforeEach(async () => {
  vi.resetModules();
  mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
  vi.stubGlobal('fetch', mockFetch);
  http = await import('../../lib/notification/adapter/http.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(entryPoints)('http %s()', (_name, call) => {
  it('bounds the request with an abort signal, since native fetch ignores a timeout option', async () => {
    await call();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://hook.example.com/fredy');
    expect(opts.timeout).toBeUndefined();
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up on an endpoint that never answers', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
    // A request that only ends when it is aborted, like a socket the other side never answers on.
    mockFetch.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason))),
    );

    await expect(call()).rejects.toThrow('HTTP notification timed out after 10 s');
    expect(timeout).toHaveBeenCalledWith(http.ENDPOINT_TIMEOUT_MS);
  });

  it('rejects when the endpoint does not accept the request, quoting its answer', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'database is down' });

    await expect(call()).rejects.toThrow('HTTP notification could not be sent. Status code: 500 (database is down)');
  });

  it('still rejects with the status code when the error body cannot be read', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => {
        throw new Error('socket hang up');
      },
    });

    await expect(call()).rejects.toThrow(/^HTTP notification could not be sent\. Status code: 502$/);
  });

  it('resolves with the response when the endpoint accepts it', async () => {
    await expect(call()).resolves.toMatchObject({ ok: true, status: 200 });
  });
});
