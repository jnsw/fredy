/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Vonovia, Germany's largest landlord, using the site's JSON API to retrieve listings.
 *
 * Users paste a search URL from https://www.vonovia.de/zuhause-finden/immobilien, which is
 * translated to the internal API endpoint:
 * GET /api/real-estate/list?{search parameters}
 *
 * Vonovia runs the same rental platform as Deutsche Wohnen, its subsidiary, which
 * `lib/services/vonovia/platform.js` reads: the same row shape, the same search token, the same
 * `data-vonovia-data` record on the detail page. Only the host, the endpoint's path and where a
 * detail page is published are Vonovia's own. The search needs no browser: the endpoint answers a
 * plain request, and vonovia.de's robots.txt allows both it and the detail pages.
 */

import { buildVonoviaPlatformProvider } from '../services/vonovia/platform.js';

/** @type {import('../services/vonovia/platform.js').VonoviaPlatformSite} */
const SITE = {
  id: 'vonovia',
  name: 'Vonovia',
  baseUrl: 'https://www.vonovia.de/',
  listPath: 'api/real-estate/list',
  detailPath: 'zuhause-finden/immobilien/',
};

const { config, createConfig, convertWebToApi, fetchSearchToken } = buildVonoviaPlatformProvider(SITE);

export const metaInformation = {
  countries: ['de'],
  name: SITE.name,
  baseUrl: SITE.baseUrl,
  id: SITE.id,
};

export { config, createConfig, convertWebToApi, fetchSearchToken };
