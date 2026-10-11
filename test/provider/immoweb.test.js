/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import * as similarityCache from '../../lib/services/similarity-check/similarityCache.js';
import { get } from '../mocks/mockNotification.js';
import { mockFredy, providerConfig } from '../utils.js';
import * as provider from '../../lib/provider/immoweb.js';

const TEST_TIMEOUT = 120_000;

/** The advert number at the end of a classified link. */
const classifiedIdOf = (link) => new URL(link).pathname.split('/').pop();

describe('#immoweb testsuite()', () => {
  let listings;

  it(
    'should test immoweb provider',
    async () => {
      const Fredy = await mockFredy();
      const mockedJob = {
        id: 'immoweb',
        notificationAdapter: null,
        spatialFilter: null,
        specFilter: null,
      };
      const runConfig = provider.createConfig(providerConfig.immoweb, []);

      const fredy = new Fredy(runConfig, mockedJob, provider.metaInformation.id, similarityCache, undefined);

      listings = await fredy.execute();

      if (listings == null || listings.length === 0) {
        throw new Error(
          'Listings is empty! (If this is the only failure, check for an Immoweb bot wall before assuming a code bug.)',
        );
      }

      expect(listings).toBeInstanceOf(Array);
      for (const listing of listings) {
        // Bedrooms and living space are read out of one paragraph, so a regression could swap them.
        // A size can be missing - some cards state none - but one that is there is never a bedroom
        // count.
        if (listing.size != null) {
          expect(listing.size).toBeTypeOf('number');
          expect(listing.size).toBeGreaterThan(10);
        }
        expect(listing.rooms === null || typeof listing.rooms === 'number').toBe(true);
      }

      const notificationObj = get();
      expect(notificationObj.serviceName).toBe('immoweb');
      for (const notify of notificationObj.payload) {
        expect(notify.id).toBeTypeOf('string');
        expect(notify.title).toBeTypeOf('string');
        expect(notify.title).not.toBe('');
        // A card that asks for the price on request has none.
        if (notify.price != null) {
          expect(notify.price).toBeTypeOf('string');
          expect(notify.price).toContain('€');
        }
        expect(notify.link).toBeTypeOf('string');
        expect(notify.link).toMatch(/^https:\/\/www\.immoweb\.be\/(en|fr|nl|de)\/classified\//);
        expect(notify.address).toBeTypeOf('string');
        expect(notify.address).not.toBe('');
      }
    },
    TEST_TIMEOUT,
  );

  // What the reconstructed fixture pins, card by card. A real recording replaces it, so these only
  // run against the cards they were written for.
  describe('the recorded cards', () => {
    /** @param {string} id */
    const card = (id) => listings.find((listing) => classifiedIdOf(listing.link) === id);

    it('reads every card and skips the ad slot between them', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(listings.map((listing) => classifiedIdOf(listing.link)).sort()).toEqual([
        '21000101',
        '21000102',
        '21000103',
        '21000104',
        '21000105',
        '21000106',
      ]);
    });

    it('reads an ordinary card', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000101')).toMatchObject({
        title: 'Apartment',
        link: 'https://www.immoweb.be/en/classified/apartment/for-rent/ixelles/1050/21000101',
        price: 1250,
        size: 78,
        rooms: 2,
        address: '1050 Ixelles',
        image: 'https://media-resize.immowebstatic.be/classifieds/fixture/21000101-1.jpg',
      });
    });

    it('reads a size written with an English thousands comma as thousands', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000102')).toMatchObject({ price: 9500, size: 1140, rooms: 6 });
    });

    it('takes the image out of an unquoted background url too', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000102').image).toBe('https://media-resize.immowebstatic.be/classifieds/fixture/21000102-1.jpg');
    });

    it('stores no size for a card that states none, rather than the bedroom count', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000103')).toMatchObject({ size: null, rooms: 3 });
    });

    it('reads the low end of a new-build project’s ranges', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000104')).toMatchObject({ price: 1100, size: 55, rooms: 1 });
    });

    it('reads a single bedroom', () => {
      if (process.env.TEST_MODE !== 'offline') return;
      expect(card('21000105')).toMatchObject({ size: 62, rooms: 1 });
    });
  });

  describe('normalize', () => {
    const base = {
      link: 'https://www.immoweb.be/fr/annonce/appartement/a-louer/bruxelles/1000/21000201?searchId=a',
      title: 'Appartement',
      priceRaw: '1250€',
      propertyText: '2 ch. 2 chambres · 78 m² mètres carrés',
      address: '1000 Bruxelles',
      image: null,
    };

    // The same advert turns up with a different `searchId` on every search, and the alive-checker
    // and the dedup both key on the link.
    it('drops the search from the link and keeps the advert number as the identity', () => {
      const first = provider.config.normalize(base);
      const second = provider.config.normalize({ ...base, link: base.link.replace('searchId=a', 'searchId=b') });

      expect(first.link).toBe('https://www.immoweb.be/fr/annonce/appartement/a-louer/bruxelles/1000/21000201');
      expect(second.id).toBe(first.id);
    });

    it('makes a relative link absolute', () => {
      const listing = provider.config.normalize({
        ...base,
        link: '/en/classified/apartment/for-rent/brussels/1000/21000201',
      });

      expect(listing.link).toBe('https://www.immoweb.be/en/classified/apartment/for-rent/brussels/1000/21000201');
    });

    it('gives the same advert a new identity when its price changes', () => {
      expect(provider.config.normalize({ ...base, priceRaw: '1300€' }).id).not.toBe(provider.config.normalize(base).id);
    });

    it('reads the bedroom count in French and Dutch as well', () => {
      expect(provider.config.normalize(base).rooms).toBe(2);
      expect(
        provider.config.normalize({ ...base, propertyText: '3 slpk. 3 slaapkamers · 95 m² vierkante meter' }),
      ).toMatchObject({
        rooms: 3,
        size: 95,
      });
    });

    it('reads a price written with grouping in any of the site’s languages', () => {
      expect(provider.config.normalize({ ...base, priceRaw: '€1,250' }).price).toBe(1250);
      expect(provider.config.normalize({ ...base, priceRaw: '1.250 €' }).price).toBe(1250);
      expect(provider.config.normalize({ ...base, priceRaw: '425000€' }).price).toBe(425000);
    });

    it('stores no price for an advert that asks for one on request', () => {
      expect(provider.config.normalize({ ...base, priceRaw: 'Price on request' }).price).toBeNull();
    });

    it('gives a card without a link no identity, so the pipeline drops it', () => {
      const listing = provider.config.normalize({ ...base, link: null });

      expect(listing.id).toBeNull();
      expect(listing.link).toBeNull();
    });
  });

  describe('createConfig', () => {
    it('asks for the newest adverts first', () => {
      expect(provider.config.sortByDateParam).toBe('orderBy=newest');
    });

    it('filters the run by its own blacklist', () => {
      const runConfig = provider.createConfig(providerConfig.immoweb, ['duplex']);
      const listing = provider.config.normalize({
        link: 'https://www.immoweb.be/en/classified/duplex/for-rent/gent/9000/21000103',
        title: 'Duplex',
        priceRaw: '980€',
      });

      expect(runConfig.filter(listing)).toBe(false);
      expect(provider.createConfig(providerConfig.immoweb, []).filter(listing)).toBe(true);
    });
  });

  it('declares Belgium, so addresses are geocoded there and the map opens on it', () => {
    expect(provider.metaInformation.countries).toEqual(['be']);
  });
});
