/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/boligsiden.js';

/**
 * Boligsiden, read through the JSON API its website uses. The website's result page the job carries
 * is translated into an API query; the fixture is a recording of that API's answer for it.
 *
 * Assertions on the run are structural, because the same file runs against the live API too.
 */
const TEST_TIMEOUT = 60_000;

describe('#boligsiden provider testsuite()', () => {
  /** @type {any[]} */
  let listings;

  beforeAll(async () => {
    const Fredy = await mockFredy();
    const runConfig = provider.createConfig(providerConfig.boligsiden, []);
    const job = { id: 'boligsiden', notificationAdapter: null, spatialFilter: null, specFilter: null };

    const fredy = new Fredy(runConfig, job, provider.metaInformation.id, similarityCache, undefined);
    listings = await fredy.execute();
  }, TEST_TIMEOUT);

  it('finds listings', () => {
    expect(listings).toBeInstanceOf(Array);
    expect(listings.length).toBeGreaterThan(0);
  });

  it('reads price, size and rooms as plain numbers', () => {
    for (const listing of listings) {
      expect(typeof listing.price, `price of ${listing.id}`).toBe('number');
      // Purchase prices in kroner: a home for less than a hundred thousand is a parsing error.
      expect(listing.price, `price of ${listing.id}`).toBeGreaterThan(100_000);
      expect(listing.size, `size of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms, `rooms of ${listing.id}`).toBeGreaterThan(0);
      expect(listing.rooms, `rooms of ${listing.id}`).toBeLessThan(30);
    }
  });

  it('gives every listing a link, a title and a Danish address', () => {
    for (const listing of listings) {
      expect(listing.link, `link of ${listing.id}`).toMatch(/^https:\/\//);
      expect(listing.title, `title of ${listing.id}`).toBeTruthy();
      expect(listing.address, `address of ${listing.id}`).toMatch(/, \d{4} /);
    }
  });

  it('places the listings itself, so the geocoder is not asked', () => {
    for (const listing of listings) {
      expect(listing.latitude, `latitude of ${listing.id}`).toBeGreaterThan(54);
      expect(listing.latitude, `latitude of ${listing.id}`).toBeLessThan(58);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeGreaterThan(8);
      expect(listing.longitude, `longitude of ${listing.id}`).toBeLessThan(16);
    }
  });

  it('declares Denmark and Danish kroner', () => {
    expect(provider.metaInformation.countries).toEqual(['dk']);
    expect(provider.metaInformation.currency).toBe('DKK');
  });
});

describe('#boligsiden search URL translation', () => {
  /** @param {string} url @returns {Record<string, string[]>|null} */
  const query = (url) => {
    const { params } = provider.toApiParams(url);
    if (params == null) return null;
    const out = {};
    for (const [key, value] of params) (out[key] ??= []).push(value);
    return out;
  };

  it('reads a municipality and the property types out of the path, and keeps the filters', () => {
    expect(
      query('https://www.boligsiden.dk/kommune/odense/tilsalg/ejerlejlighed?priceMax=3000000&priceMin=2100000'),
    ).toEqual({
      priceMax: ['3000000'],
      priceMin: ['2100000'],
      municipalities: ['odense'],
      addressTypes: ['condo'],
    });
  });

  it('reads a postcode, several types, and a search of the whole country', () => {
    expect(query('https://www.boligsiden.dk/postnummer/5000/tilsalg/andelsbolig,villalejlighed')).toEqual({
      zipCodes: ['5000'],
      addressTypes: ['cooperative,villa apartment'],
    });
    expect(query('https://www.boligsiden.dk/tilsalg/tilsalg/raekkehus?numberOfRoomsMin=3')).toEqual({
      numberOfRoomsMin: ['3'],
      addressTypes: ['terraced house'],
    });
    expect(query('https://www.boligsiden.dk/tilsalg')).toEqual({});
  });

  // The API reads `zipCodes=5000,5200` as one postcode nobody has, and answers nothing.
  it('asks for several places as a repeated parameter', () => {
    expect(query('https://www.boligsiden.dk/postnummer/5000,5200/tilsalg')).toEqual({ zipCodes: ['5000', '5200'] });
  });

  it("drops the website's own paging and sorting, which the provider sets itself", () => {
    expect(
      query('https://www.boligsiden.dk/kommune/odense/tilsalg?page=3&sortBy=price&sortAscending=false&perPage=100'),
    ).toEqual({ municipalities: ['odense'] });
  });

  it('passes a query on the API itself through untouched', () => {
    expect(query('https://api.boligsiden.dk/search/cases?zipCodes=5000&zipCodes=5200&addressTypes=villa')).toEqual({
      zipCodes: ['5000', '5200'],
      addressTypes: ['villa'],
    });
  });

  // Searching on without the part that could not be read would answer the whole of Denmark.
  it('refuses what it cannot translate instead of widening the search', () => {
    for (const url of [
      'https://www.boligsiden.dk/by/odense-c/tilsalg',
      'https://www.boligsiden.dk/kommune/odense/tilsalg/slot',
      'https://www.boligsiden.dk/kommune/odense/sted/tved/tilsalg',
      'https://www.boligsiden.dk/adresse/hunderupvej-48-5230-odense-m',
      'https://www.example.org/tilsalg',
      'not a url',
    ]) {
      const { params, problem } = provider.toApiParams(url);
      expect(params, url).toBeNull();
      expect(problem, url).toBeTypeOf('string');
    }
  });
});

describe('#boligsiden normalize', () => {
  const kase = (overrides = {}) => ({
    caseID: 'c0ffee00-0000-0000-0000-000000000001',
    caseUrl: 'https://www.example-agent.dk/case/1',
    slug: 'vejen-1-5000-odense-c-04610000__1_______',
    descriptionTitle: 'Lys villa',
    descriptionBody: 'Tekst',
    priceCash: 2495000,
    housingArea: 120,
    numberOfRooms: 5,
    yearBuilt: 1972,
    energyLabel: 'c',
    coordinates: { lat: 55.39, lon: 10.38 },
    address: { roadName: 'Vejen', houseNumber: '1', floor: '2', door: 'th', zipCode: 5000, cityName: 'Odense C' },
    defaultImage: { imageSources: [{ url: 'https://img/small.webp' }, { url: 'https://img/large.webp' }] },
    ...overrides,
  });
  const { normalize } = provider.config;

  it('reads a case into a listing', () => {
    expect(normalize(kase())).toMatchObject({
      title: 'Lys villa',
      link: 'https://www.example-agent.dk/case/1',
      price: 2495000,
      size: 120,
      rooms: 5,
      address: 'Vejen 1, 5000 Odense C',
      image: 'https://img/large.webp',
      buildYear: 1972,
      energyClass: 'C',
      latitude: 55.39,
      longitude: 10.38,
    });
  });

  // `buildHash` skips anything without a length, so a numeric price would never reach the hash and a
  // price cut would pass as the listing the user has already seen.
  it('hashes the price, so a reduction comes through as a new listing', () => {
    expect(normalize(kase()).id).not.toBe(normalize(kase({ priceCash: 2295000 })).id);
  });

  it('falls back to the address for a title and to the address page for a link', () => {
    const listing = normalize(kase({ descriptionTitle: '', caseUrl: null }));
    expect(listing.title).toBe('Vejen 1, 5000 Odense C');
    expect(listing.link).toBe('https://www.boligsiden.dk/adresse/vejen-1-5000-odense-c-04610000__1_______');
  });

  it('leaves out an energy label that is not a plain class rather than guessing one', () => {
    expect(normalize(kase({ energyLabel: 'a2020' })).energyClass).toBeUndefined();
  });
});
