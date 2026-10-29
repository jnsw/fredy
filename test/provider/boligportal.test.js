/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/boligportal.js';

// The provider waits a moment between pages, which would only slow the run against a fixture.
vi.mock('../../lib/utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sleep: () => Promise.resolve(),
}));

/**
 * BoligPortal, Denmark's largest rental portal. Its results are read from the JSON the page hydrates
 * from (`<script id="store">`), not from the cards.
 *
 * Cloudflare blocks the datacenter connections fixtures are usually recorded from, so this fixture is
 * not a recording: it reproduces the page's structure and field names as seen on the live site, with
 * made-up figures. It also holds what must NOT come out: a withdrawn advert, and the `similar_ads`
 * shown under the results.
 */
const TEST_TIMEOUT = 60_000;

describe('#boligportal provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.boligportal, []);
    const job = { id: 'boligportal', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('gives every listing a link on the portal, a title, and an address', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.boligportal\.dk\/.+-id-\d+$/);
      expect(listing.title, `title of ${listing.id}`).toBeTruthy();
      expect(listing.address, `address of ${listing.id}`).toBeTruthy();
    }
  });

  it('reads the rent, size and rooms as plain numbers', () => {
    for (const listing of listings) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      expect(listing.price).toBeGreaterThan(0);
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms).toBeLessThan(30);
    }
  });

  it('carries no duplicate listings', () => {
    const ids = listings.map((listing) => listing.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the withdrawn advert and the "similar" adverts out', () => {
    const links = listings.map((listing) => listing.link).join('\n');
    expect(links).not.toContain('5600999');
    expect(links).not.toContain('5668934');
  });

  it('declares Denmark and Danish kroner', () => {
    expect(provider.metaInformation.countries).toEqual(['dk']);
    expect(provider.metaInformation.currency).toBe('DKK');
  });
});

/**
 * The advert page's own state has no recording, so these use a page shaped like the search page's
 * state with the advert nested a few levels down. What they pin down is the behaviour that must
 * survive a redesign: the record is found by its id rather than by a path, other adverts on the page
 * are never mistaken for it, and a page without it changes nothing.
 */
describe('#boligportal detail fetch', () => {
  const page = (pageProps) =>
    `<html><body><script id="store" type="application/json">${JSON.stringify({ props: { page_props: pageProps } })}</script></body></html>`;

  const advert = {
    id: 5671615,
    description: 'Lys lejlighed.\r\nTæt på stationen.  ',
    street_name: 'Bakkegade',
    street_number: '23',
    postal_code: '3400',
    city: 'Hillerød',
    advertised_date: '2026-09-20T10:00:00Z',
  };

  it('finds the advert wherever the page nests it, and cleans the description', () => {
    const detail = provider.readAdvertDetail(page({ data: { ad: advert } }), '5671615');
    expect(detail.description).toBe('Lys lejlighed.\nTæt på stationen.');
    expect(detail.address).toBe('Bakkegade 23, 3400 Hillerød');
    expect(detail.publishedAt).toBe(Date.parse('2026-09-20T10:00:00Z'));
  });

  it('never mistakes another advert on the page for the one asked about', () => {
    const html = page({
      similar_ads: [{ ...advert, description: 'wrong' }],
      results: [{ ...advert, description: 'wrong too' }],
      ad: { ...advert, id: 999, description: 'somebody else' },
    });
    expect(provider.readAdvertDetail(html, '5671615')).toBeNull();
  });

  it('answers null for a page without state or without the advert', () => {
    expect(provider.readAdvertDetail(null, '1')).toBeNull();
    expect(provider.readAdvertDetail('<html></html>', '1')).toBeNull();
    expect(provider.readAdvertDetail(page({ ad: { id: 2, description: 'x' } }), '1')).toBeNull();
  });

  it('hands the listing back untouched when there is no browser to read the page with', async () => {
    const config = provider.createConfig({ url: 'https://www.boligportal.dk/lejeboliger/' }, []);
    const listing = { id: 'x', link: 'https://www.boligportal.dk/l/a-id-5671615', description: 'from search' };
    expect(await config.fetchDetails(listing, null)).toEqual(listing);
  });

  it('spaces the advert pages out', () => {
    const config = provider.createConfig({ url: 'https://www.boligportal.dk/lejeboliger/' }, []);
    expect(typeof config.fetchDetails).toBe('function');
    expect(config.detailFetchDelayMs).toBeGreaterThan(0);
  });
});

/** What an advert states beside the rent. The field names are the page's own; the figures are made up. */
describe('#boligportal rent basis', () => {
  const ad = (extra = {}) => ({
    id: 5671615,
    url: '/lejligheder/hiller%C3%B8d/23m2-1-vaer-id-5671615',
    title: '1 værelses lejlighed',
    city: 'Hillerød',
    postal_code: '3400',
    size_m2: 23,
    rooms: 1,
    monthly_rent: 5900,
    monthly_rent_extra_costs: 450,
    deposit: 17700,
    ...extra,
  });
  const { normalize } = provider.config;

  it('keeps the extra costs apart from the rent, and says the rent is without them', () => {
    const listing = normalize(ad());

    expect(listing.price).toBe(5900);
    expect(listing.charges).toBe(450);
    expect(listing.chargesIncluded).toBe(false);
  });

  it('makes no claim about the rent basis when no extra costs are stated', () => {
    for (const extra of [{ monthly_rent_extra_costs: null }, { monthly_rent_extra_costs: 0 }, {}]) {
      const listing = normalize({ ...ad(), monthly_rent_extra_costs: undefined, ...extra });

      expect(listing).not.toHaveProperty('charges');
      expect(listing).not.toHaveProperty('chargesIncluded');
    }
  });

  it('says nothing about charges for an advert without a rent', () => {
    expect(normalize(ad({ monthly_rent: null }))).not.toHaveProperty('chargesIncluded');
  });
});
