/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Deutsche Wohnen provider using the site's JSON API to retrieve listings.
 *
 * Users paste a search URL from https://www.deutsche-wohnen.com/mieten/mietangebote
 * which is translated to the internal API endpoint:
 * GET /api/deuwo-real-estate/list?{search parameters}
 *
 * Deutsche Wohnen is a Vonovia company and runs on the group's rental platform, which
 * `lib/services/vonovia/platform.js` reads - the search token, the paging, the detail record and
 * the price probe are all the platform's. Only the host, the endpoint's path, the parameters that
 * endpoint expects and where a detail page is published are Deutsche Wohnen's own.
 */

import { buildVonoviaPlatformProvider } from '../services/vonovia/platform.js';

/** @type {import('../services/vonovia/platform.js').VonoviaPlatformSite} */
const SITE = {
  id: 'deutscheWohnen',
  name: 'Deutsche Wohnen',
  baseUrl: 'https://www.deutsche-wohnen.com/',
  listPath: 'api/deuwo-real-estate/list',
  detailPath: 'mieten/mietangebote/',
  // What the website's own request to the endpoint carries and a pasted search page URL may not.
  defaultParams: {
    dataSet: 'deuwo',
    parkingCarport: '0',
    parkingStellplatz: '0',
    parkingGarage: '0',
    parkingTiefgarage: '0',
  },
};

const { config, createConfig, convertWebToApi, fetchSearchToken } = buildVonoviaPlatformProvider(SITE);

export const metaInformation = {
  countries: ['de'],
  name: SITE.name,
  baseUrl: SITE.baseUrl,
  id: SITE.id,
};

export { config, createConfig, convertWebToApi, fetchSearchToken };
