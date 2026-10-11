/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A proxy setting covers every request Fredy sends to a portal, not just the browser.
 *
 * `portalProxy.test.js` proves that a request through `portalFetch` really leaves through the
 * proxy. This suite proves that the portal requests are the ones that do: the providers' searches,
 * detail reads, alive probes and price probes, and the photos a notification downloads - while the
 * requests to the notification service itself stay direct.
 */

const { settings, nodeFetch } = vi.hoisted(() => ({
  settings: { current: {} },
  nodeFetch: { calls: [] },
}));

vi.mock('../../../lib/services/storage/settingsStorage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSettings: async () => settings.current,
}));
// Pacing and backoff are the providers' business, not this suite's.
vi.mock('../../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sleep: async () => {},
}));
vi.mock('../../../lib/services/logger.js', () => ({
  default: { debug() {}, info() {}, warn() {}, error() {} },
}));
// The browser has its proxy handed to it at launch (see puppeteerExtractor.test.js); what runs in
// it never reaches node's fetch, so it is replaced by the recordings the provider suites use.
vi.mock('../../../lib/services/extractor/puppeteerExtractor.js', async () => {
  const { readFixture } = await import('../../offlineFixtures.js');
  return {
    default: (url, _waitForSelector, options) => readFixture(url, options),
    launchBrowser: async () => ({ close: async () => {}, connected: true }),
    closeBrowser: async () => {},
  };
});
vi.mock('../../../lib/services/immowelt/immoweltBff.js', () => ({
  IMMOWELT_ORIGIN: 'https://www.immowelt.de',
  searchClassifieds: async () => [],
  fetchExposeHtml: async () => null,
  probeExpose: async () => -1,
  releaseSession: async () => {},
  resolveSearchAreas: async (_browser, request) => request,
}));
vi.mock('../../../lib/services/leboncoin/finder.js', () => ({
  searchAds: async () => [],
  releaseSession: async () => {},
}));
vi.mock('../../../lib/services/idealista/idealistaSearch.js', () => ({ fetchSearchHtml: async () => null }));
// Kept in the settings table in production; a fixed one keeps this suite off the database.
vi.mock('../../../lib/services/idealista/device-id.js', () => ({ idealistaDeviceId: async () => '0123456789abcdef' }));
vi.mock('../../../lib/services/storage/jobStorage.js', () => ({ getJob: () => ({ name: 'Job' }) }));
// node-fetch cannot be handed a proxy at all. Recorded to show that Pushover's own api is reached
// with it, and that no portal request is.
vi.mock('node-fetch', () => ({
  default: async (url, init) => {
    nodeFetch.calls.push({ url: String(url), init });
    return { json: async () => ({ status: 1 }) };
  },
}));

const { buildFetchMock } = await import('../../offlineFixtures.js');
const { getPortalDispatcher } = await import('../../../lib/services/proxy/portalProxy.js');
const { getProviders } = await import('../../../lib/utils.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROXY_URL = 'http://fredy:secret@proxy.example:8080';
const providerConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/provider/testProvider.json'), 'utf8'));

/** Every request node's fetch was asked to send, and the dispatcher it was asked to send it with. */
let requests = [];
const realFetch = globalThis.fetch;

beforeAll(() => {
  const answer = buildFetchMock();
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), dispatcher: init?.dispatcher });
    try {
      return await answer(input, init);
    } catch {
      // A url no recording answers for is answered the way a portal answers for a gone advert.
      return new Response('', { status: 404 });
    }
  };
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  settings.current = { proxyUrl: PROXY_URL };
  requests = [];
  nodeFetch.calls = [];
});

/**
 * Await a provider hook, treating a throw as the end of that path - a recording that does not cover
 * a hook is no concern of this suite, only the requests sent on the way are.
 * @param {() => Promise<any>} run
 */
const attempt = async (run) => {
  try {
    return await run();
  } catch {
    return null;
  }
};

/**
 * The requests made while `run` ran, each with whether it went through the proxy. One sent with
 * node-fetch never did.
 * @param {() => Promise<any>} run
 * @returns {Promise<{ url: string, proxied: boolean }[]>}
 */
async function requestsDuring(run) {
  const dispatcher = await getPortalDispatcher();
  const from = requests.length;
  const fromNodeFetch = nodeFetch.calls.length;
  await attempt(run);
  return [
    ...requests.slice(from).map(({ url, dispatcher: used }) => ({ url, proxied: used != null && used === dispatcher })),
    ...nodeFetch.calls.slice(fromNodeFetch).map(({ url }) => ({ url, proxied: false })),
  ];
}

describe('every provider request', () => {
  /** @type {Record<string, Record<string, { url: string, proxied: boolean }[]>>} */
  const byProvider = {};

  beforeAll(async () => {
    settings.current = { proxyUrl: PROXY_URL };
    const browser = { close: async () => {}, connected: true };

    for (const provider of await getProviders()) {
      const id = provider.metaInformation.id;
      const source = providerConfig[id];
      const config =
        source == null ? provider.config : await attempt(async () => provider.createConfig({ ...source, id }, []));
      if (config == null) continue;

      let listing = null;
      const phases = (byProvider[id] = {});
      phases.search = await requestsDuring(async () => {
        if (source == null || typeof config.getListings !== 'function') return;
        const raw = await config.getListings(config.url, browser);
        if (Array.isArray(raw) && raw.length > 0) listing = config.normalize(raw[0]);
      });
      // A provider whose search the recordings do not reach still has its probes exercised.
      listing ??= { id: 'probe-1', link: `${provider.metaInformation.baseUrl.replace(/\/$/, '')}/expose/1` };

      phases.details = await requestsDuring(() => config.fetchDetails?.({ ...listing }, browser));
      phases.alive = await requestsDuring(() => config.activityProbe?.(listing.link));
      phases.price = await requestsDuring(() => config.priceTracking?.probe?.(listing));
    }
  }, 120_000);

  it('goes through the configured proxy, on every path, for every provider', () => {
    const direct = Object.entries(byProvider).flatMap(([id, phases]) =>
      Object.entries(phases).flatMap(([phase, sent]) =>
        sent.filter((request) => !request.proxied).map((request) => `${id} ${phase}: ${request.url}`),
      ),
    );
    expect(direct).toEqual([]);
  });

  /**
   * Without this the test above would pass for a suite that sends nothing at all. These are the
   * providers whose search is a plain request rather than a browser page, and the paths that
   * reach their portal the same way.
   */
  it.each([
    ['immoscout', ['search', 'details', 'alive', 'price']],
    ['idealista', ['search', 'alive']],
    ['casa', ['search', 'alive']],
    ['bienici', ['search', 'alive', 'price']],
    ['betterhomes', ['search', 'details', 'alive', 'price']],
    ['tecnocasa', ['search', 'alive', 'price']],
    ['tecnorete', ['search', 'alive', 'price']],
    ['flatfox', ['search']],
    ['willhaben', ['search', 'alive']],
    ['subito', ['search', 'alive']],
    ['deutscheWohnen', ['search', 'alive']],
    ['inberlinwohnen', ['alive']],
    ['kleinanzeigen', ['alive']],
    ['wgGesucht', ['alive']],
  ])('%s reaches its portal on these paths: %j', (id, phases) => {
    for (const phase of phases) {
      expect(byProvider[id]?.[phase]?.length ?? 0, `${id} ${phase}`).toBeGreaterThan(0);
    }
  });
});

describe('photos of a listing', () => {
  const PHOTO = 'https://pictures.immobilienscout24.de/listings/1.webp';

  it('are downloaded through the proxy when Telegram cannot fetch them itself', async () => {
    const { buildPhotoFormData } = await import('../../../lib/notification/adapter/telegramPhotoUploader.js');

    const sent = await requestsDuring(() =>
      buildPhotoFormData({ chatId: 1, imageUrl: PHOTO, caption: 'A flat', parseMode: 'HTML' }),
    );

    expect(sent).toEqual([{ url: PHOTO, proxied: true }]);
  });

  it('are downloaded through the proxy for Pushover, while the message goes to Pushover directly', async () => {
    const pushover = await import('../../../lib/notification/adapter/pushover.js');

    const sent = await requestsDuring(() =>
      pushover.send({
        serviceName: 'immoscout',
        newListings: [{ id: '1', title: 'A flat', price: '1.000 €', image: PHOTO, link: 'https://x/1' }],
        notificationConfig: [{ id: 'pushover', fields: { token: 't', user: 'u' } }],
        jobKey: 'job',
        baseUrl: '',
      }),
    );

    expect(sent).toEqual([
      { url: PHOTO, proxied: true },
      { url: 'https://api.pushover.net/1/messages.json', proxied: false },
    ]);
  });
});

/**
 * The portals' code must not grow a request past the proxy again. Every module under the provider
 * directory and under the service directories the providers import is checked for a `fetch` that is
 * not `portalFetch`, and for node-fetch, which no dispatcher can reach.
 */
describe('portal code', () => {
  /**
   * These call `fetch` only inside `page.evaluate`, i.e. in the browser page, which already leaves
   * through the proxy it was launched with.
   */
  const IN_BROWSER_PAGE = new Set(['lib/services/immowelt/immoweltBff.js', 'lib/services/leboncoin/finder.js']);

  /**
   * Keeps node-fetch for an installation without a proxy, so its headers reach the portal exactly
   * as before, and switches to `portalFetch` as soon as `getPortalDispatcher` reports one. The
   * proxied half is what the provider sweep above exercises on every provider's alive probe.
   */
  const DIRECT_ONLY_WITHOUT_PROXY = new Set(['lib/services/listings/listingActiveTester.js']);

  /** @param {string} dir @returns {string[]} */
  const jsFilesIn = (dir) =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return jsFilesIn(rel);
      return entry.name.endsWith('.js') ? [rel] : [];
    });

  /** The `lib/services/<dir>` every provider reaches into, the proxy's own module aside. */
  const serviceDirs = () => {
    const dirs = new Set();
    for (const file of jsFilesIn('lib/provider')) {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const [, dir] of source.matchAll(/from '\.\.\/services\/([^/']+)\//g)) dirs.add(dir);
    }
    dirs.delete('proxy');
    return [...dirs].map((dir) => `lib/services/${dir}`);
  };

  /** @param {string} source @returns {string} the code with its comments blanked out */
  const withoutComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('sends nothing past portalFetch', () => {
    const files = ['lib/provider', ...serviceDirs()].flatMap(jsFilesIn);
    expect(files.length).toBeGreaterThan(40);

    const offenders = files.filter((file) => {
      const code = withoutComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
      if (DIRECT_ONLY_WITHOUT_PROXY.has(file)) return !/getPortalDispatcher\(\)/.test(code);
      if (/from 'node-fetch'|from 'undici'|import\('undici'\)/.test(code)) return true;
      return !IN_BROWSER_PAGE.has(file) && /(^|[^.\w])fetch\(/m.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
