/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The map and the overview filter listings by the same things, through the same server code.
 *
 * What a filter matches is asserted against a real database in
 * test/services/storage/listingsStorage.mapFilters.test.js, and how the route reads it in
 * test/api/listingsMapRoute.test.js. What is asserted here is the wiring that makes both views ask
 * that question the same way: one URL state, one drawer, one query object.
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

const mapView = read('ui/src/views/listings/Map.jsx');
const overview = read('ui/src/components/listings/ListingsOverview.jsx');
const store = read('ui/src/services/state/store.js');

describe('one set of listing filters for the overview and the map', () => {
  it('reads them from the address bar under the same keys in both views', () => {
    expect(mapView).toMatch(/const MAP_URL_STATE = \{[\s\S]*?\.\.\.FILTER_URL_STATE,/);
    expect(overview).toMatch(/const LISTINGS_URL_STATE = \{[\s\S]*?\.\.\.FILTER_URL_STATE,/);
  });

  it('offers them in the same drawer, with the same chips', () => {
    for (const view of [mapView, overview]) {
      expect(view).toMatch(/<ListingFiltersDrawer/);
      expect(view).toMatch(/describeActiveFilters\(/);
    }
  });

  it('sends the map’s filters to the server as the overview’s own query object', () => {
    expect(mapView).toMatch(/const listingsQuery = toListingsQuery\(urlState\);/);
    expect(mapView).toMatch(/getListingsForMap\(\{ filter: listingsQuery\.filter \}\)/);
    expect(store).toMatch(/async getListingsForMap\(\{ filter = \{\} \} = \{\}\)/);
  });

  it('no longer filters the commute in the browser, where only the map did it', () => {
    expect(mapView).not.toMatch(/travelTimes/);
    expect(mapView).not.toMatch(/parseCommuteFilter/);
  });

  it('reloads on any change to the query, so no filter can be left out of the list again', () => {
    // The overview's reload used to name its filters one by one and missed the connectivity ones.
    expect(overview).toMatch(/const queryKey = JSON\.stringify\(\[page, sortField, sortDir, listingsQuery\]\);/);
    expect(overview).toMatch(/\}, \[queryKey\]\);/);
    expect(mapView).toMatch(/const filterKey = JSON\.stringify\(listingsQuery\.filter\);/);
    expect(mapView).toMatch(/\}, \[filterKey\]\);/);
  });
});
