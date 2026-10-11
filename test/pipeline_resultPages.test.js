/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The pipeline reading an HTML portal over more than one result page.
 *
 * Kleinanzeigen and WG-Gesucht are read through the default extractor, so the walk from page to page
 * is the pipeline's own: it follows each page's link to the next, within the operator's page limit,
 * and stops early once a page holds nothing the job does not already know. Each search is recorded
 * as two pages - the provider's plain fixture and `<provider>_page2.html` - and the page both of
 * them link on to answers like a page past a portal's last one: it loads and lists nothing.
 *
 * The extractor is served those recordings here directly rather than through the offline test
 * mode, so this suite never touches the network in either mode.
 */
const state = vi.hoisted(() => ({
  settings: {},
  knownHashes: [],
  failingUrls: new Set(),
}));

vi.mock('../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../lib/services/storage/listingsStorage.js', async () => {
  const store = await import('./mocks/mockStore.js');
  return { ...store, getKnownListingHashesForJobAndProvider: () => state.knownHashes };
});
vi.mock('../lib/services/storage/settingsStorage.js', async () => {
  const store = await import('./mocks/mockStore.js');
  return { ...store, getSettings: async () => state.settings };
});
vi.mock('../lib/services/geocoding/geoCodingService.js', () => ({ geocodeAddress: async () => null }));
vi.mock('../lib/services/storage/jobStorage.js', () => ({ getJob: (jobKey) => ({ id: jobKey, userId: 'user1' }) }));
vi.mock('../lib/services/sse/sse-broker.js', () => ({ sendToUser: () => {} }));
vi.mock('../lib/notification/notify.js', () => ({ send: () => [Promise.resolve()] }));
vi.mock('../lib/services/extractor/puppeteerExtractor.js', async () => {
  const { readFixture } = await import('./offlineFixtures.js');
  return {
    default: vi.fn(async (url, waitForSelector, options) =>
      state.failingUrls.has(url) ? null : readFixture(url, options),
    ),
  };
});

import puppeteerExtractor from '../lib/services/extractor/puppeteerExtractor.js';
import logger from '../lib/services/logger.js';
import { parse } from '../lib/services/extractor/parser/parser.js';
import FredyPipelineExecutioner from '../lib/FredyPipelineExecutioner.js';
import * as kleinanzeigen from '../lib/provider/kleinanzeigen.js';
import * as wgGesucht from '../lib/provider/wgGesucht.js';
import { providerConfig as testProviders } from './utils.js';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'testFixtures');

/**
 * The listings a recorded page holds, normalized the way the pipeline normalizes them.
 *
 * @param {any} provider The provider module.
 * @param {string} fixture File name inside the fixture directory.
 * @returns {Promise<any[]>}
 */
async function listingsOn(provider, fixture) {
  const html = await readFile(path.join(FIXTURES_DIR, fixture), 'utf-8');
  return parse(provider.config.crawlContainer, provider.config.crawlFields, html, fixture).map((raw) =>
    provider.config.normalize(raw),
  );
}

/**
 * Run one provider pass over its recorded search and report what came of it.
 *
 * @param {any} provider The provider module.
 * @returns {Promise<{found: any[], pagesRead: string[]}>} The listings the run found new, and the
 *   addresses the extractor was asked for.
 */
async function runSearch(provider) {
  const id = provider.metaInformation.id;
  const runConfig = provider.createConfig(testProviders[id], []);
  const pipeline = new FredyPipelineExecutioner(
    runConfig,
    { id: `job-${id}`, notificationAdapter: null, specFilter: null, spatialFilter: null },
    id,
    { checkAndAddEntry: () => false },
    undefined,
    { resultPagePauseMs: 0 },
  );
  const found = (await pipeline.execute()) ?? [];
  return { found, pagesRead: puppeteerExtractor.mock.calls.map(([url]) => url) };
}

beforeEach(() => {
  state.settings = {};
  state.knownHashes = [];
  state.failingUrls = new Set();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe.each([
  ['kleinanzeigen', kleinanzeigen, 'seite:2/', 'seite:3/'],
  ['wgGesucht', wgGesucht, '.30.0.1.1.html?pagination=1', '.30.0.1.2.html?pagination=1'],
])('%s result pages', (name, provider, secondPageMarker, thirdPageMarker) => {
  it('follows the first page to the second and finds the listings of both', async () => {
    const firstPage = await listingsOn(provider, `${name}.html`);
    const secondPage = await listingsOn(provider, `${name}_page2.html`);

    const { found, pagesRead } = await runSearch(provider);

    // The default limit of three: the third page is the empty one past the recording, which ends
    // the walk by bringing nothing new.
    expect(pagesRead).toHaveLength(3);
    expect(pagesRead[1]).toContain(secondPageMarker);
    const foundIds = new Set(found.map((listing) => listing.id));
    expect(firstPage.every((listing) => foundIds.has(listing.id))).toBe(true);
    expect(secondPage.every((listing) => foundIds.has(listing.id))).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('reads no more pages than the operator allows', async () => {
    state.settings = { maxResultPages: 2 };

    const { pagesRead } = await runSearch(provider);

    expect(pagesRead).toHaveLength(2);
  });

  it('reads the first page alone when the operator set the limit to one', async () => {
    state.settings = { maxResultPages: 1 };
    const firstPage = await listingsOn(provider, `${name}.html`);

    const { found, pagesRead } = await runSearch(provider);

    expect(pagesRead).toHaveLength(1);
    expect(found.map((listing) => listing.id).sort()).toEqual(firstPage.map((listing) => listing.id).sort());
  });

  it('does not ask for the second page when the first holds nothing the job does not know', async () => {
    state.knownHashes = (await listingsOn(provider, `${name}.html`)).map((listing) => listing.id);

    const { found, pagesRead } = await runSearch(provider);

    expect(pagesRead).toHaveLength(1);
    expect(found).toEqual([]);
  });

  it('keeps the listings of the first page when the second cannot be loaded', async () => {
    const firstPage = await listingsOn(provider, `${name}.html`);
    const secondUrl = provider.config.pagination.nextPageUrl(
      await readFile(path.join(FIXTURES_DIR, `${name}.html`), 'utf-8'),
      testProviders[name].url,
    );
    state.failingUrls = new Set([secondUrl]);

    const { found, pagesRead } = await runSearch(provider);

    expect(pagesRead).toEqual([expect.any(String), secondUrl]);
    expect(found.map((listing) => listing.id).sort()).toEqual(firstPage.map((listing) => listing.id).sort());
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('result page 2 could not be read'));
  });

  it('reads a page without a link to the next one as the last', async () => {
    const html = await readFile(path.join(FIXTURES_DIR, `${name}_page2.html`), 'utf-8');

    expect(provider.config.pagination.nextPageUrl(html, testProviders[name].url)).toContain(thirdPageMarker);
    expect(provider.config.pagination.nextPageUrl('<html><body></body></html>', testProviders[name].url)).toBeNull();
  });
});

describe('next result page links', () => {
  it("takes Kleinanzeigen's own link, which puts the page in front of the keyword", async () => {
    const html = await readFile(path.join(FIXTURES_DIR, 'kleinanzeigen.html'), 'utf-8');

    expect(kleinanzeigen.config.pagination.nextPageUrl(html, testProviders.kleinanzeigen.url)).toBe(
      'https://www.kleinanzeigen.de/s-immobilien/duesseldorf/anzeige:angebote/seite:2/wohnung/k0c195l2068r5',
    );
  });

  it("takes WG-Gesucht's own link, which keeps the search's query string", () => {
    const html = `<div class="text-center">
      <a class="black_text_link mr5" href="https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.0.html?sort_column=0&amp;sort_order=0&amp;pagination=1">&lt;</a>
      <a class="black_text_link mr5" href="https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.0.html?sort_column=0&amp;sort_order=0&amp;pagination=1">1</a>
      <span class="text-orange mr5">2</span>
      <a class="black_text_link mr5" href="https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.2.html?sort_column=0&amp;sort_order=0&amp;pagination=1">3</a>
      <a class="black_text_link mr5" href="https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.2.html?sort_column=0&amp;sort_order=0&amp;pagination=1">&gt;</a>
    </div>`;

    expect(
      wgGesucht.config.pagination.nextPageUrl(
        html,
        'https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.1.html?sort_column=0&sort_order=0&pagination=1',
      ),
    ).toBe('https://www.wg-gesucht.de/wg-zimmer-in-Duesseldorf.30.0.1.2.html?sort_column=0&sort_order=0&pagination=1');
  });

  it('does not follow a link off the portal', async () => {
    const runConfig = {
      ...kleinanzeigen.createConfig(testProviders.kleinanzeigen, []),
      pagination: { nextPageUrl: () => 'https://elsewhere.example/seite:2' },
    };
    const pipeline = new FredyPipelineExecutioner(
      runConfig,
      { id: 'job-offsite', notificationAdapter: null, specFilter: null, spatialFilter: null },
      'kleinanzeigen',
      { checkAndAddEntry: () => false },
      undefined,
      { resultPagePauseMs: 0 },
    );

    await pipeline.execute();

    expect(puppeteerExtractor.mock.calls.map(([url]) => new URL(url).host)).toEqual(['www.kleinanzeigen.de']);
  });
});
