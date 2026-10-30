/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
// Portal requests read the proxy setting. No database is open here, so there is none.
vi.mock('../../../lib/services/storage/settingsStorage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSettings: async () => ({}),
}));

import { resolveGeoTag, searchListings, SMG_API } from '../../../lib/services/smg/api.js';

/** A place as the location lookup answers it. */
const place = (id, urlNames, is24UrlNames = {}) => ({ geoLocation: { id, urlNames, is24UrlNames } });

const ZURICH_ANSWER = {
  results: [
    place('geo-city-zurich', { de: 'ort-zuerich', en: 'city-zurich' }, { en: 'city-zuerich' }),
    place('geo-canton-zurich', { de: 'kanton-zuerich' }),
    place('geo-zipcode-8006', { de: 'plz-8006' }, { en: 'postcode-8006-zuerich' }),
  ],
};

/** Answers the lookup per language and name, from the table given, and records what was asked. */
function lookup(table) {
  const asked = [];
  const fetchMock = vi.fn(async (url) => {
    const params = new URL(String(url)).searchParams;
    asked.push(`${params.get('lang')}|${params.get('name')}`);
    return {
      ok: true,
      status: 200,
      json: async () => table[`${params.get('lang')}|${params.get('name')}`] ?? { results: [] },
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return asked;
}

afterEach(() => vi.unstubAllGlobals());

describe('resolveGeoTag', () => {
  it('takes the place whose own URL name is the slug, and none of the others the lookup found', async () => {
    lookup({ 'de|zuerich': ZURICH_ANSWER });
    expect(await resolveGeoTag({ slug: 'kanton-zuerich', lang: 'de', label: 'test' })).toBe('geo-canton-zurich');
  });

  it("reads ImmoScout24's own spelling of a place as well as Homegate's", async () => {
    lookup({ 'en|8006-zuerich': ZURICH_ANSWER });
    expect(await resolveGeoTag({ slug: 'postcode-8006-zuerich', lang: 'en', label: 'test' })).toBe('geo-zipcode-8006');
  });

  // The lookup answers in the language it is asked in, and "zuerich" means nothing in English.
  it('asks in German when the language of the URL finds nothing', async () => {
    const asked = lookup({ 'de|zuerich': ZURICH_ANSWER });
    expect(await resolveGeoTag({ slug: 'city-zuerich', lang: 'en', label: 'test' })).toBe('geo-city-zurich');
    expect(asked).toEqual(['en|zuerich', 'en|city-zuerich', 'de|zuerich']);
  });

  it('answers null rather than the nearest match when no place has the slug', async () => {
    lookup({ 'de|zuerichsee': ZURICH_ANSWER });
    expect(await resolveGeoTag({ slug: 'region-zuerichsee', lang: 'de', label: 'test' })).toBeNull();
  });
});

describe('searchListings', () => {
  it('posts the body to the search endpoint and hands back the answer', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [{ id: '1' }] }) }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await searchListings({ query: { offerType: 'RENT' } }, 'test')).toEqual({ results: [{ id: '1' }] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${SMG_API}/search/listings`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ query: { offerType: 'RENT' } });
  });

  it('answers null for a refusal, a broken answer and a network failure', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'nope',
    }));
    expect(await searchListings({}, 'test')).toBeNull();

    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ message: 'x' }) }));
    expect(await searchListings({}, 'test')).toBeNull();

    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNRESET');
    });
    expect(await searchListings({}, 'test')).toBeNull();
  });
});
