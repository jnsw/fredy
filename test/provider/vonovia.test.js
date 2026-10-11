/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import { get } from '../mocks/mockNotification.js';
import * as provider from '../../lib/provider/vonovia.js';

/** Run-scoped provider config, built per test via createConfig(). */
let runConfig;

// Vonovia uses a JSON API (fetch-based, no browser), like Deutsche Wohnen on the same platform.
const TEST_TIMEOUT = 120_000;

const TOKEN_URL = 'https://www.vonovia.de/api/real-estate/search-token';

describe('#vonovia provider testsuite()', () => {
  runConfig = provider.createConfig(providerConfig.vonovia, [], []);

  let liveListings;

  it(
    'should test vonovia provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'vonovia',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

      liveListings = await fredy.execute();

      if (liveListings == null || liveListings.length === 0) {
        throw new Error('Listings is empty!');
      }

      expect(liveListings).toBeInstanceOf(Array);
      const notificationObj = get();
      expect(notificationObj).toBeTypeOf('object');
      expect(notificationObj.serviceName).toBe('vonovia');

      const hasValidNotification = notificationObj.payload.some((notify) => {
        return (
          typeof notify.id === 'string' &&
          typeof notify.price === 'string' &&
          notify.price.includes('€') &&
          typeof notify.size === 'string' &&
          notify.size.includes('m²') &&
          typeof notify.title === 'string' &&
          notify.title !== '' &&
          typeof notify.link === 'string' &&
          notify.link.startsWith('https://www.vonovia.de/zuhause-finden/immobilien/') &&
          typeof notify.address === 'string' &&
          notify.address !== ''
        );
      });

      expect(hasValidNotification).toBe(true);
    },
    TEST_TIMEOUT,
  );

  // The recorded search is larger than one page of the endpoint, so a run that stops after the
  // first page loses listings the portal shows.
  it('walks past the first page of the recorded search', () => {
    if (process.env.TEST_MODE !== 'offline') return;
    expect(liveListings.length).toBeGreaterThan(50);
  });

  it('passes on the position the endpoint knows, and none where it reports 0/0', () => {
    if (!liveListings?.length) throw new Error('No listings from the first test');

    const placed = liveListings.filter((listing) => listing.latitude != null);
    expect(placed.length).toBeGreaterThan(0);
    for (const listing of placed) {
      expect(listing.latitude).not.toBe(0);
      expect(listing.longitude).not.toBe(0);
    }
  });

  describe('convertWebToApi', () => {
    it('turns the search page into the list endpoint, keeping the search', () => {
      const api = new URL(
        provider.convertWebToApi(
          'https://www.vonovia.de/zuhause-finden/immobilien?rentType=miete&city=K%C3%B6ln&perimeter=5&immoType=wohnung&scroll=3',
        ),
      );

      expect(api.origin + api.pathname).toBe('https://www.vonovia.de/api/real-estate/list');
      expect(api.searchParams.get('city')).toBe('Köln');
      expect(api.searchParams.get('rentType')).toBe('miete');
      expect(api.searchParams.get('perimeter')).toBe('5');
      expect(api.searchParams.has('scroll')).toBe(false);
    });

    // Deutsche Wohnen's endpoint wants a `dataSet` and the parking filters; Vonovia's does not, and
    // must not be sent Deutsche Wohnen's stock selector.
    it("adds none of Deutsche Wohnen's parameters", () => {
      const api = new URL(provider.convertWebToApi('https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden'));

      expect(api.searchParams.has('dataSet')).toBe(false);
      expect(api.searchParams.has('parkingCarport')).toBe(false);
    });

    /**
     * The endpoint answers a `limit` above 50 with `406 Not Acceptable` and an empty body, which
     * looks exactly like being blocked.
     */
    it('caps the page size at what the endpoint accepts', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden&limit=100'),
      );

      expect(api.searchParams.get('limit')).toBe('50');
    });

    it('caps it on a pasted API url too, which is passed through otherwise', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.vonovia.de/api/real-estate/list?city=Dresden&limit=100'),
      );

      expect(api.pathname).toBe('/api/real-estate/list');
      expect(api.searchParams.get('city')).toBe('Dresden');
      expect(api.searchParams.get('limit')).toBe('50');
    });

    it('leaves a page size below the cap alone', () => {
      const api = new URL(
        provider.convertWebToApi('https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden&limit=15'),
      );

      expect(api.searchParams.get('limit')).toBe('15');
    });

    it('is what createConfig queries, with the pasted page kept as the referer', () => {
      const pasted = 'https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden';
      const config = provider.createConfig({ url: pasted, enabled: true }, []);

      expect(config.url).toBe(provider.convertWebToApi(pasted));
      expect(config.refererUrl).toBe(pasted);
    });
  });

  describe('getListings', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    /** A page of rows in the shape the API returns them. */
    const rows = (from, count, overrides = {}) =>
      Array.from({ length: count }, (_, index) => ({
        wrk_id: `wrk-${from + index}`,
        vermarktungsart_miete: '1',
        titel: 'Wohnung',
        preis: 700,
        groesse: 60,
        anzahl_zimmer: 2,
        slug: `slug-${from + index}`,
        strasse: 'Seidnitzer Str. 1',
        plz: '01069',
        ort: 'Dresden OT Pirnaische Vorstadt',
        lat: 0,
        lng: 0,
        ...overrides,
      }));

    /**
     * A fetch that answers the token endpoint the way Vonovia does and hands every search to
     * `search`, so the tests below count list requests only.
     */
    const withToken = (search) => async (url, init) =>
      String(url) === TOKEN_URL ? { ok: true, json: async () => ({ token: 'token', ttl: 900 }) } : search(url, init);

    const apiUrl = () => provider.convertWebToApi('https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden');

    /**
     * The list endpoint answers a search without a token with `401 {"error":"Unauthorized"}`, the
     * same as Deutsche Wohnen's: the website fetches one first and sends it as `X-VON-Search-Token`.
     */
    it('sends the token the website fetches before it searches', async () => {
      globalThis.fetch = async (url, init) => {
        if (String(url) === TOKEN_URL) {
          return { ok: true, json: async () => ({ token: 'token-from-endpoint', ttl: 900 }) };
        }
        return new Headers(init?.headers).get('X-VON-Search-Token') === 'token-from-endpoint'
          ? { ok: true, json: async () => ({ paging: { info: { count: 1, limit: 50 } }, results: rows(0, 1) }) }
          : { ok: false, status: 401, statusText: 'Unauthorized' };
      };

      const listings = await provider.config.getListings(apiUrl());

      expect(listings).toHaveLength(1);
    });

    it('sends the search page as the referer', async () => {
      const referers = [];
      globalThis.fetch = withToken(async (url, init) => {
        referers.push(new Headers(init?.headers).get('Referer'));
        return { ok: true, json: async () => ({ paging: { info: { count: 1, limit: 50 } }, results: rows(0, 1) }) };
      });
      const pasted = 'https://www.vonovia.de/zuhause-finden/immobilien?city=Dresden';
      const config = provider.createConfig({ url: pasted, enabled: true }, []);

      await config.getListings.call({ _providerConfig: config }, config.url);

      expect(referers).toEqual([pasted]);
    });

    it('walks the pages the cap leaves behind', async () => {
      const offsets = [];
      globalThis.fetch = withToken(async (url) => {
        const offset = Number.parseInt(new URL(url).searchParams.get('offset') ?? '0', 10);
        offsets.push(offset);
        return {
          ok: true,
          json: async () => ({ paging: { info: { count: 62, limit: 50 } }, results: rows(offset, offset ? 12 : 50) }),
        };
      });

      const listings = await provider.config.getListings(apiUrl());

      expect(offsets).toEqual([0, 50]);
      expect(listings).toHaveLength(62);
    });

    it('keeps the pages it already has when a later one fails', async () => {
      let calls = 0;
      globalThis.fetch = withToken(async () => {
        calls++;
        return calls === 1
          ? { ok: true, json: async () => ({ paging: { info: { count: 62, limit: 50 } }, results: rows(0, 50) }) }
          : { ok: false, status: 406, statusText: 'Not Acceptable' };
      });

      const listings = await provider.config.getListings(apiUrl());

      expect(listings).toHaveLength(50);
    });

    it('drops rows that are not offered for rent', async () => {
      globalThis.fetch = withToken(async () => ({
        ok: true,
        json: async () => ({
          paging: { info: { count: 2, limit: 50 } },
          results: [...rows(0, 1), ...rows(1, 1, { vermarktungsart_miete: '0' })],
        }),
      }));

      const listings = await provider.config.getListings(apiUrl());

      expect(listings.map((listing) => listing.id)).toEqual(['wrk-0']);
    });

    it('builds the detail link and the address from the row', async () => {
      globalThis.fetch = withToken(async () => ({
        ok: true,
        json: async () => ({ paging: { info: { count: 1, limit: 50 } }, results: rows(0, 1) }),
      }));

      const [listing] = await provider.config.getListings(apiUrl());

      expect(listing.link).toBe('https://www.vonovia.de/zuhause-finden/immobilien/slug-0');
      expect(listing.address).toBe('Seidnitzer Str. 1, 01069 Dresden OT Pirnaische Vorstadt');
    });
  });

  describe('normalize', () => {
    it('rounds the rent and treats the 0/0 position the API sends for unknown coordinates as none', () => {
      const listing = provider.config.normalize({ id: 'x', price: 704.06, latitude: 0, longitude: 0 });

      expect(listing.price).toBe(704);
      expect(listing.latitude).toBeNull();
      expect(listing.longitude).toBeNull();
    });
  });

  describe('with provider_details enabled', () => {
    it(
      'should enrich listings with details',
      async () => {
        if (!liveListings?.length) throw new Error('No listings from first test to enrich');

        const enriched = await runConfig.fetchDetails(liveListings[0]);

        expect(enriched).toBeTruthy();
        expect(enriched.link).toContain('https://www.vonovia.de/');
        expect(enriched.address).toBeTypeOf('string');
        expect(enriched.address).not.toBe('');
        if (enriched.description != null) {
          expect(enriched.description).toBeTypeOf('string');
          expect(enriched.description).not.toBe('');
        }
      },
      TEST_TIMEOUT,
    );

    // The record names the contact person in fields of its own. Those stay out of the description;
    // whatever the advert's own text says is the advert's.
    it('reads the description and the cost table, and leaves the contact fields out', async () => {
      if (process.env.TEST_MODE !== 'offline') return;

      const enriched = await runConfig.fetchDetails({ ...liveListings[0], description: null });

      expect(enriched.address).toBe('Seidnitzer Str. 7a, 01069 Dresden OT Pirnaische Vorstadt');
      expect(enriched.description).toMatch(/^Beschreibung\n/);
      expect(enriched.description).toContain('Kaltmiete: 1.296,26 €');
      expect(enriched.description).not.toContain('vermietung@vonovia.de');
      expect(enriched.description).not.toContain('+49 000 00000000');
    });
  });
});
