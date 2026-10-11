/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { buildFredyListingUrl } from '../../lib/notification/fredyUrl.js';

describe('buildFredyListingUrl()', () => {
  it('builds the listing route from a regular base URL', () => {
    expect(buildFredyListingUrl('https://fredy.example', 'abc')).toBe('https://fredy.example/#/listings/listing/abc');
  });

  it('tolerates trailing slashes and surrounding whitespace', () => {
    expect(buildFredyListingUrl('  https://fredy.example//  ', 'abc')).toBe(
      'https://fredy.example/#/listings/listing/abc',
    );
    expect(buildFredyListingUrl('https://fredy.example/', 'abc')).toBe('https://fredy.example/#/listings/listing/abc');
  });

  it('replaces a hash route copied along from an open Fredy page', () => {
    expect(buildFredyListingUrl('https://fredy.example/#/dashboard', 'abc')).toBe(
      'https://fredy.example/#/listings/listing/abc',
    );
  });

  it('keeps the sub path of a reverse proxy', () => {
    expect(buildFredyListingUrl('https://example.test/fredy', 'abc')).toBe(
      'https://example.test/fredy/#/listings/listing/abc',
    );
    expect(buildFredyListingUrl('https://example.test/fredy/#/listings', 'abc')).toBe(
      'https://example.test/fredy/#/listings/listing/abc',
    );
  });

  it('adds http when the configured host has no scheme', () => {
    expect(buildFredyListingUrl('192.168.1.10:9998', 'abc')).toBe('http://192.168.1.10:9998/#/listings/listing/abc');
    expect(buildFredyListingUrl('fredy.local', 'abc')).toBe('http://fredy.local/#/listings/listing/abc');
  });

  it('encodes the listing id', () => {
    expect(buildFredyListingUrl('https://fredy.example', 'a/b')).toBe('https://fredy.example/#/listings/listing/a%2Fb');
  });

  it('gives no link without a base URL, without an id, or for a base URL that is no URL', () => {
    expect(buildFredyListingUrl('', 'abc')).toBeNull();
    expect(buildFredyListingUrl('   ', 'abc')).toBeNull();
    expect(buildFredyListingUrl(undefined, 'abc')).toBeNull();
    expect(buildFredyListingUrl('https://fredy.example', null)).toBeNull();
    expect(buildFredyListingUrl('http://exa mple', 'abc')).toBeNull();
  });
});
