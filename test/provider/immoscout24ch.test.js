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
import * as provider from '../../lib/provider/immoscout24ch.js';

/**
 * ImmoScout24.ch, read through the SMG API, which answers each request with the real values or a
 * rewritten copy at random. The recording holds both answers to the job's first page, and offline the
 * rewritten one is served first: a run that kept it would store wrong prices, rooms and sizes.
 */
const TEST_TIMEOUT = 60_000;

const RECORDING = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'testFixtures', 'immoscout24ch_search.json'),
    'utf8',
  ),
);

describe('#immoscout24ch provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.immoscout24ch, []);
    const job = { id: 'immoscout24ch', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('gives every listing a link, a title and a Swiss address', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\/www\.immoscout24\.ch\/(rent|buy)\/\d+$/);
      expect(listing.title, `title of ${listing.id}`).toBeTruthy();
      expect(listing.address, `address of ${listing.id}`).toMatch(/\d{4} /);
    }
  });

  it('honours the search it was given: 3.5 rooms and 80 m² at least, 2000 francs at most', () => {
    for (const listing of listings) {
      if (listing.rooms != null) expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThanOrEqual(3.5);
      // The portal itself lets a 79 m² flat through a "from 80 m²" search, so the area gets a margin.
      if (listing.size != null) expect(listing.size, `size of ${listing.id}`).toBeGreaterThanOrEqual(72);
      if (listing.price != null) expect(listing.price, `price of ${listing.id}`).toBeLessThanOrEqual(2000);
    }
  });

  it('places the listings itself, so the geocoder is not asked', () => {
    for (const listing of listings) {
      expect(listing.latitude, `latitude of ${listing.id}`).toBeGreaterThan(45.8);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeGreaterThan(5.9);
    }
  });

  // Only offline is it known which of the two answers was served first.
  it.runIf(process.env.TEST_MODE === 'offline')('keeps the real values and never the rewritten ones', () => {
    const real = new Map(RECORDING.real.results.map((entry) => [entry.listing.id, entry.listing]));
    const rewritten = new Map(RECORDING.rewritten.results.map((entry) => [entry.listing.id, entry.listing]));

    for (const listing of listings) {
      const id = listing.link.split('/').pop();
      expect(listing.rooms, `rooms of ${id}`).toBe(real.get(id).characteristics.numberOfRooms ?? null);
      expect(listing.rooms, `rooms of ${id}`).not.toBe(rewritten.get(id).characteristics.numberOfRooms);
    }
  });

  it('declares Switzerland and Swiss francs', () => {
    expect(provider.metaInformation.countries).toEqual(['ch']);
    expect(provider.metaInformation.currency).toBe('CHF');
  });
});

describe('#immoscout24ch search URL translation', () => {
  const searchOf = (url) => provider.parseSearchUrl(url).search;

  it('reads the language, the types, the place and the filters', () => {
    expect(searchOf('https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich?nrf=3&nrt=3.5&slf=60&pt=3000')).toEqual({
      lang: 'de',
      location: 'ort-zuerich',
      radius: null,
      query: {
        offerType: 'RENT',
        propertyType: 'APARTMENT',
        numberOfRooms: { from: 3, to: 3.5 },
        livingSpace: { from: 60 },
        monthlyRent: { to: 3000 },
      },
      dropped: [],
    });
  });

  it('puts the price on the purchase price for a purchase, with the unit letter applied', () => {
    expect(searchOf('https://www.immoscout24.ch/en/house/buy/canton-zurich?pf=500t&pt=2m').query).toEqual({
      offerType: 'BUY',
      propertyType: 'HOUSE_OR_CHALET_OR_RUSTICO',
      purchasePrice: { from: 500000, to: 2000000 },
    });
  });

  it('reads all of Switzerland when the URL names no place, and the language from the offer word', () => {
    expect(searchOf('https://www.immoscout24.ch/immobili/affittare')).toMatchObject({
      lang: 'it',
      location: null,
      query: { offerType: 'RENT', propertyType: 'APARTMENT_OR_HOUSE' },
    });
  });

  it('reads a radius in kilometres, the way the site writes it', () => {
    expect(searchOf('https://www.immoscout24.ch/de/wohnung/mieten/ort-bern?r=5').radius).toBe(5000);
    expect(searchOf('https://www.immoscout24.ch/de/wohnung/mieten/ort-bern?r=1500').radius).toBe(1500);
  });

  // The API refuses a query naming a property type and categories at once.
  it('reads object types into categories, in place of the property type', () => {
    const { query, dropped } = searchOf(
      'https://www.immoscout24.ch/en/flat/rent/quarter-wollishofen-zurich?pty=127,3,94',
    );
    expect(query.categories).toEqual(['SINGLE_ROOM']);
    expect(query).not.toHaveProperty('propertyType');
    expect(dropped).toEqual(['pty=94']);
  });

  it('decodes the facilities bitmask', () => {
    expect(searchOf('https://www.immoscout24.ch/en/flat/rent/city-zuerich?an=400').query.hasBalcony).toBe(true);
    // Read right to left, five bits a character: '3' is bits 0 and 1, '8' is bit 8.
    const { query } = searchOf('https://www.immoscout24.ch/en/flat/rent/city-zuerich?an=83');
    expect(query).toMatchObject({ isWheelchairAccessible: true, arePetsAllowed: true, hasElevator: true });
    expect(searchOf('https://www.immoscout24.ch/en/flat/rent/city-zuerich?an=1').dropped).toEqual([]);
    expect(searchOf('https://www.immoscout24.ch/en/flat/rent/city-zuerich?an=4').dropped).toEqual(['an bit 2']);
    expect(searchOf('https://www.immoscout24.ch/en/flat/rent/city-zuerich?an=x!').dropped).toEqual(['an=X!']);
  });

  it('ignores paging and sorting, and names every other parameter it could not translate', () => {
    expect(searchOf('https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich?pn=3&o=price-asc&xyz=1').dropped).toEqual(
      ['xyz'],
    );
  });

  it('refuses a path it cannot read instead of searching something else', () => {
    for (const url of [
      'https://www.immoscout24.ch/de/parkplatz/mieten/ort-zuerich',
      'https://www.immoscout24.ch/de/mieten/ort-zuerich',
      'https://www.immoscout24.ch/de/wohnung/ort-zuerich',
      'https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich/seite-2',
      'not a url',
    ]) {
      const { search, problem } = provider.parseSearchUrl(url);
      expect(search, url).toBeNull();
      expect(problem, url).toBeTypeOf('string');
    }
  });

  it('reads the price range with its unit letters', () => {
    expect(
      priceRangeFromUrl(
        'https://www.immoscout24.ch/de/wohnung/mieten/ort-zuerich?pf=1t&pt=2500',
        provider.config.priceRangeParams,
      ),
    ).toEqual({ min: 1000, max: 2500 });
  });
});

describe('#immoscout24ch normalize', () => {
  const entry = (prices, extra = {}) => ({
    id: '4000000001',
    listing: {
      id: '4000000001',
      offerType: prices.buy ? 'BUY' : 'RENT',
      prices,
      characteristics: { numberOfRooms: 3.5, livingSpace: 85, yearBuilt: 1965 },
      address: {
        street: 'Via Franscini 20',
        postalCode: '6830',
        locality: 'Chiasso',
        geoCoordinates: { latitude: 45.83, longitude: 9.03 },
      },
      meta: { createdAt: '2026-10-11T08:00:00.000Z' },
      localization: {
        primary: 'it',
        it: {
          text: { title: 'Appartamento', description: 'Luminoso.' },
          attachments: [
            { type: 'DOCUMENT', url: 'https://cdn/plan.pdf' },
            { type: 'IMAGE', url: 'https://cdn/photo.jpg' },
          ],
        },
        de: { text: { title: 'Wohnung (übersetzt)' } },
      },
      ...extra,
    },
  });
  const { normalize } = provider.config;

  it("reads the advertiser's own language, the first photo and the coordinates", () => {
    expect(normalize(entry({ rent: { gross: 1500, interval: 'MONTH' } }))).toMatchObject({
      title: 'Appartamento',
      description: 'Luminoso.',
      link: 'https://www.immoscout24.ch/rent/4000000001',
      size: 85,
      rooms: 3.5,
      address: 'Via Franscini 20, 6830 Chiasso',
      image: 'https://cdn/photo.jpg',
      latitude: 45.83,
      longitude: 9.03,
      buildYear: 1965,
      publishedAt: Date.parse('2026-10-11T08:00:00.000Z'),
    });
  });

  it('quotes the Nettomiete with the charges beside it, and the Bruttomiete only when there is no net', () => {
    expect(normalize(entry({ rent: { net: 1300, extra: 200, gross: 1500, interval: 'MONTH' } }))).toMatchObject({
      price: 1300,
      chargesIncluded: false,
      charges: 200,
    });
    expect(normalize(entry({ rent: { gross: 1500, interval: 'MONTH' } }))).toMatchObject({
      price: 1500,
      chargesIncluded: true,
    });
  });

  it('reads a yearly price per square metre as no rent, rather than as a cheap one', () => {
    expect(normalize(entry({ rent: { area: 'M2', gross: 350, interval: 'YEAR' } })).price).toBeNull();
  });

  it('reads a purchase price, and links a purchase as one', () => {
    const listing = normalize(entry({ buy: { price: 1290000 } }));
    expect(listing.price).toBe(1290000);
    expect(listing).not.toHaveProperty('chargesIncluded');
    expect(listing.link).toBe('https://www.immoscout24.ch/buy/4000000001');
  });

  // `buildHash` skips anything without a length, so a numeric price would never reach the hash.
  it('hashes the price, so a reduction comes through as a new listing', () => {
    expect(normalize(entry({ rent: { gross: 1500 } })).id).not.toBe(normalize(entry({ rent: { gross: 1450 } })).id);
  });
});
