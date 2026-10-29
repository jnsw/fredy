/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Nominatim ranks by relevance, not by the postcode the portal wrote. `45659 Stadtmitte` (a district
 * of Recklinghausen) comes back with Berlin's Stadtmitte, postcode 10117, in first place, and taking
 * that answer moved the listing hundreds of kilometres - and out of any area filter around
 * Recklinghausen, which deletes it.
 */
const root = (await import('node:path')).resolve('.');
const clientPath = root + '/lib/services/geocoding/client/nominatimClient.js';
const { extractPostcode } = await import(root + '/lib/services/geocoding/postcode.js');

/** @type {Object[]} */
let responses;
/** @type {string[]} */
let urls;

const answer = (status, body = []) => ({
  status,
  statusText: String(status),
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const NOT_FOUND = { lat: -1, lng: -1 };

async function loadClient() {
  vi.resetModules();
  urls = [];
  // No one-second spacing between requests, which the cases below do not exercise.
  vi.doMock('p-throttle', () => ({ default: () => (fn) => fn }));
  vi.doMock('node-fetch', () => ({
    default: async (url) => {
      urls.push(url);
      return responses.shift();
    },
  }));
  const client = await import(clientPath);
  client.__resetRateLimit();
  return client;
}

beforeEach(() => {
  responses = [];
});

describe('Nominatim postcode validation', () => {
  it('rejects a first result whose postcode contradicts the query', async () => {
    responses.push(
      answer(200, [
        { lat: '52.5120808', lon: '13.3896554', address: { postcode: '10117' } },
        { lat: '51.2219385', lon: '6.7844229', address: {} },
      ]),
    );
    const client = await loadClient();

    await expect(client.geocode('45659 Stadtmitte', ['de'])).resolves.toEqual(NOT_FOUND);
    expect(urls[0]).toContain('addressdetails=1');
  });

  it('uses a matching result even when Nominatim ranks a different postcode first', async () => {
    responses.push(
      answer(200, [
        { lat: '52.5120808', lon: '13.3896554', address: { postcode: '10117' } },
        { lat: '51.6166565', lon: '7.1857027', address: { postcode: '45659' } },
      ]),
    );
    const client = await loadClient();

    await expect(client.geocode('45659 Stadtmitte', ['de'])).resolves.toEqual({ lat: 51.6166565, lng: 7.1857027 });
  });

  it('accepts a result that lists several postcodes, one of them the requested one', async () => {
    responses.push(answer(200, [{ lat: '52.53', lon: '13.38', address: { postcode: '10115;10117' } }]));
    const client = await loadClient();

    await expect(client.geocode('10117 Berlin', ['de'])).resolves.toEqual({ lat: 52.53, lng: 13.38 });
  });

  it('takes the first result, as before, when the address names no postcode', async () => {
    responses.push(answer(200, [{ lat: '50.94', lon: '6.96', address: { postcode: '50667' } }]));
    const client = await loadClient();

    await expect(client.geocode('Domplatte, Köln', ['de'])).resolves.toEqual({ lat: 50.94, lng: 6.96 });
  });

  it('keeps the request scoped to the countries asked about', async () => {
    responses.push(answer(200, [{ lat: '47.37', lon: '8.54', address: { postcode: '8001' } }]));
    const client = await loadClient();

    await expect(client.geocode('Bahnhofstrasse 1, 8001 Zürich', ['ch'])).resolves.toEqual({ lat: 47.37, lng: 8.54 });
    expect(urls[0]).toContain('countrycodes=ch');
  });

  it.each([
    ['Austrian', '1030 Wien', ['at'], '1010'],
    ['Swiss', '8001 Zürich', ['ch'], '3000'],
  ])('rejects a contradictory postcode in %s scope', async (_label, query, countries, wrong) => {
    responses.push(answer(200, [{ lat: '1', lon: '2', address: { postcode: wrong } }]));
    const client = await loadClient();

    await expect(client.geocode(query, countries)).resolves.toEqual(NOT_FOUND);
  });

  it('preserves rate-limit semantics instead of treating an outage as not found', async () => {
    responses.push(answer(429));
    const client = await loadClient();

    await expect(client.geocode('45659 Stadtmitte', ['de'])).resolves.toBeNull();
    expect(client.isPaused()).toBe(true);
    expect(urls).toHaveLength(1);
  });
});

describe('extractPostcode()', () => {
  it.each([
    ['a leading postcode', '45659 Stadtmitte', ['de'], '45659'],
    ['a postcode after a comma', 'Musterstraße 12, 10117 Berlin', ['de'], '10117'],
    ['a postcode followed by a trailing aside', '40217 Unterbilk (0.6 km)', ['de'], '40217'],
    ['a postcode after a house number without a comma', 'Musterstraße 1030 10117 Berlin', ['de', 'at'], '10117'],
    ['the postcode, not an earlier four-digit house number', 'Musterstraße 1030, 10117 Berlin', ['de', 'at'], '10117'],
    ['a four-digit postcode in Austria', 'Landstraßer Hauptstraße 1, 1030 Wien', ['at'], '1030'],
  ])('finds %s', (_label, address, countries, expected) => {
    expect(extractPostcode(address, countries)).toBe(expected);
  });

  it.each([
    ['four digits where postcodes have five', 'Haus 1030, Berlin', ['de']],
    ['a lone house number before a locality', 'Musterstraße 1030 Wien', ['at']],
    ['an address without any number', 'Domplatte, Köln', ['de']],
    ['nothing at all', undefined, ['de']],
  ])('finds nothing in %s', (_label, address, countries) => {
    expect(extractPostcode(address, countries)).toBeNull();
  });
});
