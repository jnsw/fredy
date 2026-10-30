/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

vi.mock('../../lib/services/extractor/puppeteerExtractor.js', () => ({ default: vi.fn() }));
vi.mock('../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Portal requests read the proxy setting. No database is open here, so there is none.
vi.mock('../../lib/services/storage/settingsStorage.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getSettings: async () => ({}),
}));

import puppeteerExtractor from '../../lib/services/extractor/puppeteerExtractor.js';
import { parse } from '../../lib/services/extractor/parser/parser.js';
import { moveInToday } from '../../lib/utils/moveInDate.js';
import { config as immoscoutConfig } from '../../lib/provider/immoscout.js';
import { config as immoscoutAtConfig } from '../../lib/provider/immoscoutAt.js';
import { config as wgGesuchtConfig } from '../../lib/provider/wgGesucht.js';
import { config as inberlinwohnenConfig } from '../../lib/provider/inberlinwohnen.js';
import { config as flatfoxConfig } from '../../lib/provider/flatfox.js';
import { config as deutscheWohnenConfig } from '../../lib/provider/deutscheWohnen.js';
import { config as immobilienDeConfig } from '../../lib/provider/immobilienDe.js';

/**
 * Every provider's path to the move-in date, against the real payloads. The parser itself is
 * covered in `test/utils/moveInDate.test.js`; what is tested here is the wiring - which field each
 * provider reads, and that it is the one its search page or exposé actually carries.
 *
 * The search-page providers state the date for nothing; the exposé providers only once
 * `provider_details` is on for them, which is the detail fetch they already make.
 */
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../testFixtures');
const readFixture = async (name) => readFile(path.join(FIXTURES_DIR, name), 'utf-8');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What a provider's search page reads as, through the same parser the pipeline uses.
 *
 * @param {import('../../lib/types/providerConfig.js').ProviderConfig} config
 * @param {string} fixture
 * @returns {Promise<import('../../lib/types/listing.js').ParsedListing[]>}
 */
async function listingsOnSearchPage(config, fixture) {
  const html = await readFixture(fixture);
  return parse(config.crawlContainer, config.crawlFields, html, fixture).map(config.normalize);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('from the search page', () => {
  it('wgGesucht reads the column between rent and size', async () => {
    const listings = await listingsOnSearchPage(wgGesuchtConfig, 'wgGesucht.html');

    expect(listings.length).toBeGreaterThan(0);
    // Every card of the recording states one.
    expect(listings.every((listing) => ISO_DATE.test(listing.availableFrom))).toBe(true);
    expect(listings.find((listing) => listing.link.includes('13831139')).availableFrom).toBe('2026-08-01');
    // A sublet states its first and last day; the first is when it can be moved into.
    expect(listings.find((listing) => listing.link.includes('3403212')).availableFrom).toBe('2026-10-01');
  });

  it("inberlinwohnen reads the card's Bezugsfertig ab", async () => {
    const listings = await listingsOnSearchPage(inberlinwohnenConfig, 'inberlinwohnen.html');

    expect(listings.length).toBeGreaterThan(0);
    expect(listings.every((listing) => ISO_DATE.test(listing.availableFrom))).toBe(true);
    expect(listings.map((listing) => listing.availableFrom)).toContain('2026-09-01');
  });

  it('flatfox reads its moving date and the kind of date it is', async () => {
    const results = JSON.parse(await readFixture('flatfox_listings.json'));
    const byType = (type) => results.filter((raw) => raw.moving_date_type === type);

    expect(byType('dat').length).toBeGreaterThan(0);
    for (const raw of byType('dat')) {
      expect(flatfoxConfig.normalize(raw).availableFrom).toBe(raw.moving_date);
    }
    // Immediately is today; "by agreement" names no day.
    expect(byType('imm').map((raw) => flatfoxConfig.normalize(raw).availableFrom)).toEqual(
      byType('imm').map(() => moveInToday()),
    );
    expect(byType('agr').every((raw) => flatfoxConfig.normalize(raw).availableFrom === null)).toBe(true);
  });
});

describe('from the exposé, in the detail fetch the provider already makes', () => {
  it('immoscout reads the Bezugsfrei ab attribute', async () => {
    const detail = JSON.parse(await readFixture('immoscout_detail.json'));
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => detail }));

    const enriched = await immoscoutConfig.fetchDetails({ link: 'https://www.immobilienscout24.de/expose/168963883' });

    expect(enriched.availableFrom).toBe('2026-07-01');
  });

  it('immoscout Österreich reads "ab sofort" as today', async () => {
    const detail = JSON.parse(await readFixture('immoscoutAt_detail.json'));
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => detail }));

    const enriched = await immoscoutAtConfig.fetchDetails({ link: 'https://www.immobilienscout24.de/expose/1' });

    expect(enriched.availableFrom).toBe(moveInToday());
  });

  it('immoscout knows no date when the exposé states none', async () => {
    const detail = JSON.parse(await readFixture('immoscout_detail.json'));
    for (const section of detail.sections) {
      section.attributes = (section.attributes ?? []).filter((attribute) => attribute.label !== 'Bezugsfrei ab:');
    }
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => detail }));

    const enriched = await immoscoutConfig.fetchDetails({ link: 'https://www.immobilienscout24.de/expose/168963883' });

    expect(enriched.availableFrom).toBeNull();
  });

  it("deutscheWohnen reads the exposé data's availableFrom", async () => {
    puppeteerExtractor.mockResolvedValue(await readFixture('deutscheWohnen_detail.html'));

    const enriched = await deutscheWohnenConfig.fetchDetails({ id: '1', link: 'https://x' }, null);

    expect(enriched.availableFrom).toBe('2026-08-29');
  });

  it('immobilienDe reads "Nach Absprache" as no date, and a date as that date', async () => {
    const html = await readFixture('immobilienDe_detail.html');
    puppeteerExtractor.mockResolvedValue(html);
    const listing = { id: '1', link: 'https://www.immobilien.de/expose/1' };

    expect((await immobilienDeConfig.fetchDetails(listing, null)).availableFrom).toBeNull();

    // The recording says "Nach Absprache"; the same field with a date in it is what a dated exposé
    // carries. Only the payload's own field is changed, not the rendered fact table.
    const dated = html.replace('availableFrom\\":\\"Nach Absprache', 'availableFrom\\":\\"01.10.2026');
    expect(dated).not.toBe(html);
    puppeteerExtractor.mockResolvedValue(dated);

    expect((await immobilienDeConfig.fetchDetails(listing, null)).availableFrom).toBe('2026-10-01');
  });
});
