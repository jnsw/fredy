/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import logger from '../../lib/services/logger.js';
import * as immoscout from '../../lib/provider/immoscout.js';
import * as immoscoutAt from '../../lib/provider/immoscoutAt.js';

/**
 * ImmoScout read over more than one result page, against two recorded pages of each national site.
 *
 * The recordings are served by hand rather than through the offline test mode, so these never touch
 * the network in either mode. The mobile API counts its pages with `pagenumber` and states in every
 * response how many there are; the recordings say 23 and 61, which is what lets the tests below see
 * the budget, rather than the end of the search, stop the walk.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');

const readJson = async (name) => JSON.parse(await readFile(path.join(FIXTURES_DIR, name), 'utf-8'));

/** @type {Record<string, any[]>} Each site's recorded pages, in order. */
const recorded = {};

beforeAll(async () => {
  recorded.immoscout = [await readJson('immoscout_list.json'), await readJson('immoscout_list_page2.json')];
  recorded.immoscoutAt = [await readJson('immoscoutAt_list.json'), await readJson('immoscoutAt_list_page2.json')];
});

/**
 * Serve one site's recorded pages by the page the request asks for, and nothing for a page past
 * them, so a test that walks too far fails on what it got rather than on a network error.
 *
 * @param {any[]} pages
 * @param {(page: number) => any} [override] Replaces the answer to one page, e.g. with a failure.
 * @returns {import('vitest').Mock}
 */
function serve(pages, override) {
  const fetchMock = vi.fn(async (url) => {
    const page = Number(new URL(url).searchParams.get('pagenumber') ?? 1);
    const replaced = override?.(page);
    if (replaced != null) return replaced;
    const body = pages[page - 1] ?? { ...pages[0], resultListItems: [] };
    return { ok: true, status: 200, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const exposeIds = (page) =>
  page.resultListItems.filter((item) => item.type === 'EXPOSE_RESULT').map((item) => String(item.item.id));

const pagesAsked = (fetchMock) => fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get('pagenumber'));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe.each([
  ['immoscout', immoscout, 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten'],
  ['immoscoutAt', immoscoutAt, 'https://www.immobilienscout24.at/regional/wien/wien/wohnung-mieten'],
])('%s result pages', (name, provider, searchUrl) => {
  const runConfig = provider.createConfig({ url: searchUrl, enabled: true }, []);

  it('reads the second page as well, without repeating a listing that sits on both', async () => {
    const fetchMock = serve(recorded[name]);

    const listings = await runConfig.getListings(runConfig.url, undefined, { maxPages: 2, pauseMs: 0 });

    const expected = [...new Set([...exposeIds(recorded[name][0]), ...exposeIds(recorded[name][1])])];
    expect(listings.map((listing) => String(listing.id))).toEqual(expected);
    // The first request is the one Fredy always sent; only the pages after it name their number.
    expect(pagesAsked(fetchMock)).toEqual([null, '2']);
  });

  it('reads the first page alone when called without a budget', async () => {
    const fetchMock = serve(recorded[name]);

    const listings = await runConfig.getListings(runConfig.url);

    expect(listings).toHaveLength(exposeIds(recorded[name][0]).length);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not read on past a page that holds only listings the job already knows', async () => {
    const fetchMock = serve(recorded[name]);
    const known = new Set(exposeIds(recorded[name][0]));

    await runConfig.getListings(runConfig.url, undefined, {
      maxPages: 3,
      pauseMs: 0,
      isKnown: (raw) => known.has(String(raw.id)),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the first page when the second one is refused', async () => {
    serve(recorded[name], (page) =>
      page === 2 ? { ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'slow down' } : null,
    );

    const listings = await runConfig.getListings(runConfig.url, undefined, { maxPages: 3, pauseMs: 0 });

    expect(listings.map((listing) => String(listing.id))).toEqual(exposeIds(recorded[name][0]));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('429'));
  });

  it('keeps the first page when the second one does not arrive at all', async () => {
    serve(recorded[name], (page) => (page === 2 ? Promise.reject(new Error('socket hang up')) : null));

    const listings = await runConfig.getListings(runConfig.url, undefined, { maxPages: 3, pauseMs: 0 });

    expect(listings).toHaveLength(exposeIds(recorded[name][0]).length);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('result page 2'), 'socket hang up');
  });
});

describe('immoscout result pages and the end of the search', () => {
  const runConfig = immoscout.createConfig(
    { url: 'https://www.immobilienscout24.de/Suche/de/nordrhein-westfalen/duesseldorf/wohnung-mieten', enabled: true },
    [],
  );

  it('stops at the last page the response names, whatever the budget', async () => {
    const [first, second] = recorded.immoscout;
    const fetchMock = serve([
      { ...first, numberOfPages: 2 },
      { ...second, numberOfPages: 2 },
    ]);

    await runConfig.getListings(runConfig.url, undefined, { maxPages: 10, pauseMs: 0 });

    expect(pagesAsked(fetchMock)).toEqual([null, '2']);
  });

  it('treats a response without a page count as the last page rather than walking to the limit', async () => {
    const { numberOfPages: _ignored, ...withoutCount } = recorded.immoscout[0];
    const fetchMock = serve([withoutCount, recorded.immoscout[1]]);

    await runConfig.getListings(runConfig.url, undefined, { maxPages: 10, pauseMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers a refused search with no listings, as it always did', async () => {
    serve(recorded.immoscout, () => ({
      ok: false,
      status: 412,
      statusText: 'Precondition Failed',
      text: async () => 'bad parameter',
    }));

    await expect(runConfig.getListings(runConfig.url, undefined, { maxPages: 3, pauseMs: 0 })).resolves.toEqual([]);
  });
});
