/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../../lib/services/storage/listingsStorage.js', () => ({
  getGeocoordinatesByAddress: vi.fn(() => null),
}));
vi.mock('../../../lib/services/providers/providerCountries.js', () => ({
  getProviderIdsForCountries: vi.fn(async () => []),
}));

const NOT_FOUND = { lat: -1, lng: -1 };
const geocodeMock = vi.fn();
vi.mock('../../../lib/services/geocoding/client/nominatimClient.js', () => ({
  geocode: geocodeMock,
  isPaused: () => false,
}));

const { geocodeAddress, __resetValidatedCoordinates } =
  await import('../../../lib/services/geocoding/geoCodingService.js');
const { getGeocoordinatesByAddress } = await import('../../../lib/services/storage/listingsStorage.js');

/** The addresses handed to the geocoder, in order. */
const asked = () => geocodeMock.mock.calls.map((call) => call[0]);

beforeEach(() => {
  geocodeMock.mockReset();
  getGeocoordinatesByAddress.mockReset();
  getGeocoordinatesByAddress.mockReturnValue(null);
  __resetValidatedCoordinates();
});

/**
 * Retrying an address that Nominatim could not find, without the trailing parenthesis.
 *
 * Kleinanzeigen writes how far a listing is from the searched point into the address itself, so what
 * reaches the geocoder looks like `40217 Unterbilk (0.6 km)`. Nominatim reads that as part of the
 * place name and answers "no such place", which is not an error: the listing is stored with no
 * coordinates, no area filter can judge it and no travel time is computed. The same address without
 * the distance resolves.
 *
 * Only on an empty answer, never on one that worked. `40211 Stadtmitte (1 km)` resolves to
 * Düsseldorf as written, and to Berlin without the distance - there is a Stadtmitte in both. Since
 * `_filterByArea` deletes listings that fall outside the area, replacing a good answer with a wrong
 * one would not merely misplace a pin, it would delete the listing.
 */
describe('geocodeAddress retrying without a trailing parenthesis', () => {
  it('retries an address it could not find, without the parenthesis', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce({ lat: 51.2127, lng: 6.7742 });

    await expect(geocodeAddress('40217 Unterbilk (0.6 km)', ['de'])).resolves.toEqual({
      lat: 51.2127,
      lng: 6.7742,
    });
    expect(asked()).toEqual(['40217 Unterbilk (0.6 km)', '40217 Unterbilk']);
  });

  it('leaves an address that resolved alone, so a good answer is never replaced by a worse one', async () => {
    geocodeMock.mockResolvedValueOnce({ lat: 51.2219, lng: 6.7844 });

    await expect(geocodeAddress('40211 Stadtmitte (1 km)', ['de'])).resolves.toEqual({
      lat: 51.2219,
      lng: 6.7844,
    });
    expect(asked()).toEqual(['40211 Stadtmitte (1 km)']);
  });

  it('reports not found when the retry cannot find it either', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await expect(geocodeAddress('Nowhere at all (2 km)', ['de'])).resolves.toEqual(NOT_FOUND);
    expect(asked()).toHaveLength(2);
  });

  it('does not retry an address with no parenthesis and no postcode to fall back to', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await geocodeAddress('Unterbilk, Düsseldorf', ['de']);
    expect(asked()).toEqual(['Unterbilk, Düsseldorf']);
  });

  // A null answer means the geocoder could not be reached, or is standing off after a 429. Asking
  // again would double the requests exactly when Nominatim has said to stop.
  it('does not retry when the geocoder never answered', async () => {
    geocodeMock.mockResolvedValue(null);

    await expect(geocodeAddress('40217 Unterbilk (0.6 km)', ['de'])).resolves.toBeNull();
    expect(asked()).toEqual(['40217 Unterbilk (0.6 km)']);
  });

  it('does not retry an address that is nothing but a parenthesis', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await geocodeAddress('(0.6 km)', ['de']);
    expect(asked()).toEqual(['(0.6 km)']);
  });

  it('drops only the last parenthesis, and only at the end', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce({ lat: 1, lng: 2 });

    await geocodeAddress('Musterstr. 1 (Hinterhaus), 12345 Berlin (3 km)', ['de']);
    expect(asked()[1]).toBe('Musterstr. 1 (Hinterhaus), 12345 Berlin');
  });
});

/**
 * The postcode alone, as the last resort for an address that names one.
 *
 * The Nominatim client only accepts a result in the postcode the address names. `45659 Stadtmitte`
 * is a district of Recklinghausen, and Nominatim's answers for it are the Stadtmitte of Berlin,
 * Düsseldorf and Rostock, so all of them are turned down. The middle of 45659 is still a far better
 * position than none: the area filter can judge the listing and a travel time can be computed.
 */
describe('geocodeAddress falling back to the postcode', () => {
  it('asks for the postcode alone once the address and its shorter form found nothing', async () => {
    geocodeMock
      .mockResolvedValueOnce(NOT_FOUND)
      .mockResolvedValueOnce(NOT_FOUND)
      .mockResolvedValueOnce({ lat: 51.61, lng: 7.18 });

    await expect(geocodeAddress('45659 Stadtmitte (2 km)', ['de'])).resolves.toEqual({ lat: 51.61, lng: 7.18 });
    expect(asked()).toEqual(['45659 Stadtmitte (2 km)', '45659 Stadtmitte', '45659']);
  });

  it('asks for the postcode once only, and in the same countries', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce({ lat: 47.37, lng: 8.54 });

    await geocodeAddress('8001 Zürich', ['ch']);
    expect(geocodeMock.mock.calls).toEqual([
      ['8001 Zürich', ['ch']],
      ['8001', ['ch']],
    ]);
  });

  it('reports not found when even the postcode finds nothing', async () => {
    geocodeMock.mockResolvedValue(NOT_FOUND);

    await expect(geocodeAddress('45659 Stadtmitte', ['de'])).resolves.toEqual(NOT_FOUND);
    expect(asked()).toEqual(['45659 Stadtmitte', '45659']);
  });

  it('stops at the first answer and never asks for the postcode after one', async () => {
    geocodeMock.mockResolvedValueOnce({ lat: 51.2127, lng: 6.7742 });

    await geocodeAddress('40217 Unterbilk', ['de']);
    expect(asked()).toEqual(['40217 Unterbilk']);
  });
});

/**
 * A row stored before the postcode was checked may carry exactly the wrong position this fixes, and
 * nothing on it says which postcode its coordinates are in. Reading it would hand that position to
 * every later listing at the same address, so an address with a postcode only trusts what was
 * checked since the process started.
 */
describe('geocodeAddress caching for an address with a postcode', () => {
  it('does not take coordinates from the database', async () => {
    getGeocoordinatesByAddress.mockReturnValue({ lat: 52.51, lng: 13.39 });
    geocodeMock.mockResolvedValueOnce({ lat: 51.61, lng: 7.18 });

    await expect(geocodeAddress('45659 Stadtmitte', ['de'])).resolves.toEqual({ lat: 51.61, lng: 7.18 });
    expect(getGeocoordinatesByAddress).not.toHaveBeenCalled();
  });

  it('still takes them from the database for an address without one', async () => {
    getGeocoordinatesByAddress.mockReturnValue({ lat: 50.94, lng: 6.96 });

    await expect(geocodeAddress('Domplatte, Köln', ['de'])).resolves.toEqual({ lat: 50.94, lng: 6.96 });
    expect(geocodeMock).not.toHaveBeenCalled();
  });

  it('asks Nominatim once for the same address', async () => {
    geocodeMock.mockResolvedValueOnce({ lat: 51.61, lng: 7.18 });

    await geocodeAddress('45659 Stadtmitte', ['de']);
    await expect(geocodeAddress('45659 Stadtmitte', ['de'])).resolves.toEqual({ lat: 51.61, lng: 7.18 });
    expect(asked()).toEqual(['45659 Stadtmitte']);
  });

  it('keeps the answers of different countries apart', async () => {
    geocodeMock.mockResolvedValueOnce({ lat: 1, lng: 2 }).mockResolvedValueOnce({ lat: 3, lng: 4 });

    await geocodeAddress('Hauptstrasse 1, 10115 Berlin', ['de']);
    await expect(geocodeAddress('Hauptstrasse 1, 10115 Berlin', ['fr'])).resolves.toEqual({ lat: 3, lng: 4 });
    expect(geocodeMock).toHaveBeenCalledTimes(2);
  });

  it('does not remember an address it could not find', async () => {
    geocodeMock.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(NOT_FOUND);
    await geocodeAddress('45659 Stadtmitte', ['de']);

    geocodeMock.mockResolvedValueOnce({ lat: 51.61, lng: 7.18 });
    await expect(geocodeAddress('45659 Stadtmitte', ['de'])).resolves.toEqual({ lat: 51.61, lng: 7.18 });
  });
});
