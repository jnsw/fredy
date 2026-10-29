/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { priceRangeFromUrl } from '../../lib/services/tracking/priceRange.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/homegate.js';

/**
 * Homegate, read through the SMG API like ImmoScout24.ch, with the search URL translated by the API's
 * own translator. The recording holds the translation and both answers the search can come back
 * with; offline the rewritten one is served first.
 */
const TEST_TIMEOUT = 60_000;

const RECORDING = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures', 'homegate_search.json'),
    'utf8',
  ),
);

describe('#homegate provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.homegate, []);
    const job = { id: 'homegate', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  // The job's URL is Italian, so the links are too.
  it('links every listing in the language of the search URL', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.homegate\.ch\/affittare\/\d+$/);
      expect(listing.title, `title of ${listing.id}`).toBeTruthy();
      expect(listing.address, `address of ${listing.id}`).toMatch(/\d{4} /);
    }
  });

  it('honours the search it was given: 3.5 rooms at least', () => {
    for (const listing of listings) {
      if (listing.rooms != null) expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThanOrEqual(3.5);
    }
  });

  it.runIf(process.env.TEST_MODE === 'offline')('keeps the real values and never the rewritten ones', () => {
    const real = new Map(RECORDING.real.results.map((entry) => [entry.listing.id, entry.listing]));

    for (const listing of listings) {
      const id = listing.link.split('/').pop();
      const recorded = real.get(id);
      expect(listing.size, `size of ${id}`).toBe(recorded.characteristics.livingSpace ?? null);
      expect(listing.rooms, `rooms of ${id}`).toBe(recorded.characteristics.numberOfRooms ?? null);
    }
  });

  it('declares Switzerland and Swiss francs', () => {
    expect(provider.metaInformation.countries).toEqual(['ch']);
    expect(provider.metaInformation.currency).toBe('CHF');
  });
});

describe('#homegate configuration', () => {
  const entry = { listing: { id: '4003459485', offerType: 'BUY', prices: { buy: { price: 990000 } } } };

  it('writes the link in the language of the search URL, and German without one', () => {
    const french = provider.createConfig({
      url: 'https://www.homegate.ch/acheter/maison/lieu-lausanne/liste-annonces',
    });
    expect(french.normalize(entry).link).toBe('https://www.homegate.ch/acheter/4003459485');
    expect(provider.config.normalize(entry).link).toBe('https://www.homegate.ch/kaufen/4003459485');
  });

  it('reads the rent band, or the purchase band, the way the site writes it', () => {
    const rangeOf = (url) => priceRangeFromUrl(url, provider.config.priceRangeParams);
    expect(rangeOf('https://www.homegate.ch/mieten/wohnung/ort-zuerich/trefferliste?ag=500&ah=1t')).toEqual({
      min: 500,
      max: 1000,
    });
    expect(rangeOf('https://www.homegate.ch/kaufen/haus/ort-zuerich/trefferliste?ai=500000&aj=2m&ah=1')).toEqual({
      min: 500000,
      max: 2000000,
    });
  });

  it.runIf(process.env.TEST_MODE === 'offline')(
    'reports a URL the translator refuses instead of searching anything',
    async () => {
      const config = provider.createConfig({ url: 'https://www.homegate.ch/mieten/wohnung/ort-zuerich' });
      expect(await config.getListings(config.url)).toEqual([]);
    },
  );
});
