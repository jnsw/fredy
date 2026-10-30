/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { LISTING_STATUSES } from '../../lib/services/listings/listingStatus.js';
import { STATUS_VALUES } from '../../ui/src/components/listings/statusOptions.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf-8');

/**
 * The frontend may not import from `lib/`, so the list of statuses exists twice. A status the
 * server accepts but the control does not offer can never be picked; one the control offers but
 * the server refuses fails on every click.
 */
describe('listing statuses', () => {
  it('are the same list, in the same order, on both sides', () => {
    expect(STATUS_VALUES.filter((value) => value != null)).toEqual([...LISTING_STATUSES]);
  });

  it('starts with "no status", which the controls offer as a choice of its own', () => {
    expect(STATUS_VALUES[0]).toBeNull();
  });

  it('each have a colour in the status control', () => {
    const less = read('ui/src/components/listings/StatusControl.less');
    for (const status of LISTING_STATUSES) {
      expect(less, status).toMatch(new RegExp(`&--${status}\\b`));
    }
  });

  it('are not set back to "applied" by copying the letter once more', () => {
    const modal = read('ui/src/views/listings/components/ApplicationModal.jsx');
    expect(modal).toMatch(/if \(status != null && status !== 'applied'\)/);
    for (const caller of [
      'ui/src/views/listings/ListingDetail.jsx',
      'ui/src/components/listings/ListingsOverview.jsx',
    ]) {
      expect(read(caller), caller).toMatch(/<ApplicationModal[\s\S]*?status=\{/);
    }
  });

  it('no longer spells the list out by hand in the filter or the title block', () => {
    expect(read('ui/src/components/listings/ListingsFilterPanel.jsx')).toMatch(/statusOptions\(t\)/);
    expect(read('ui/src/views/listings/components/ListingTitleBlock.jsx')).not.toMatch(/RadioGroup/);
  });
});
