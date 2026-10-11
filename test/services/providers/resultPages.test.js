/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import logger from '../../../lib/services/logger.js';
import {
  DEFAULT_MAX_RESULT_PAGES,
  MAX_RESULT_PAGES_LIMIT,
  SINGLE_PAGE,
  resolveMaxResultPages,
  walkResultPages,
} from '../../../lib/services/providers/resultPages.js';

/**
 * A search of several pages, read by id. Each entry is one page's ids; a page past the last comes
 * back empty, the way most portals answer one.
 *
 * @param {string[][]} pages
 * @param {{lastPageKnown?: boolean}} [options] Whether the reader says which page is the last.
 * @returns {import('vitest').Mock}
 */
function searchOf(pages, { lastPageKnown = true } = {}) {
  return vi.fn(async (page) => ({
    listings: (pages[page - 1] ?? []).map((id) => ({ id })),
    ...(lastPageKnown ? { lastPage: page >= pages.length } : {}),
  }));
}

const walk = (readPage, budget) =>
  walkResultPages({ readPage, idOf: (raw) => raw.id, budget: { pauseMs: 0, ...budget }, label: 'test' });

const ids = (listings) => listings.map((listing) => listing.id);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('walkResultPages', () => {
  it('reads every page up to the one that says it is the last', async () => {
    const readPage = searchOf([['a', 'b'], ['c', 'd'], ['e']]);

    const listings = await walk(readPage, { maxPages: 10 });

    expect(ids(listings)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(readPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
  });

  it('never reads more pages than the budget allows', async () => {
    const readPage = searchOf([['a'], ['b'], ['c'], ['d']]);

    const listings = await walk(readPage, { maxPages: 2 });

    expect(ids(listings)).toEqual(['a', 'b']);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('reads the first page alone when no budget is given, as every search did before', async () => {
    const readPage = searchOf([['a'], ['b']]);

    const listings = await walkResultPages({ readPage, idOf: (raw) => raw.id, label: 'test' });

    expect(ids(listings)).toEqual(['a']);
    expect(readPage).toHaveBeenCalledTimes(1);
    expect(SINGLE_PAGE.maxPages).toBe(1);
  });

  it('stops at an empty page when the portal does not say which page is the last', async () => {
    const readPage = searchOf([['a'], ['b']], { lastPageKnown: false });

    const listings = await walk(readPage, { maxPages: 5 });

    expect(ids(listings)).toEqual(['a', 'b']);
    // The third page is the empty one that ends the walk; nothing is asked after it.
    expect(readPage).toHaveBeenCalledTimes(3);
  });

  it('stops at a page that only repeats what was already read, as when the page parameter is ignored', async () => {
    const readPage = vi.fn(async () => ({ listings: [{ id: 'a' }, { id: 'b' }] }));

    const listings = await walk(readPage, { maxPages: 5 });

    expect(ids(listings)).toEqual(['a', 'b']);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('keeps a listing repeated across a page boundary once', async () => {
    // A listing published during the walk pushes the last one of page one onto page two.
    const readPage = searchOf([
      ['a', 'b', 'c'],
      ['c', 'd', 'e'],
    ]);

    expect(ids(await walk(readPage, { maxPages: 3 }))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps listings without an id, which it cannot recognise as repeats', async () => {
    const readPage = vi.fn(async () => ({ listings: [{ title: 'no id' }, { id: 'a' }], lastPage: true }));

    expect(await walk(readPage, { maxPages: 3 })).toEqual([{ title: 'no id' }, { id: 'a' }]);
  });

  it('stops after a page that holds only listings the job already knows', async () => {
    const readPage = searchOf([['new', 'old-1'], ['old-2', 'old-3'], ['old-4']]);
    const known = new Set(['old-1', 'old-2', 'old-3', 'old-4']);

    const listings = await walk(readPage, { maxPages: 10, isKnown: (raw) => known.has(raw.id) });

    // Page one held something new, so page two was read; page two held nothing new, so page three
    // - older still, and read by an earlier run - was not.
    expect(ids(listings)).toEqual(['new', 'old-1', 'old-2', 'old-3']);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  it('reads no further than page one when everything on it is known', async () => {
    const readPage = searchOf([['old-1', 'old-2'], ['old-3']]);

    await walk(readPage, { maxPages: 10, isKnown: () => true });

    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('keeps the earlier pages when a later page fails', async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ listings: [{ id: 'a' }, { id: 'b' }] })
      .mockRejectedValueOnce(new Error('blocked'));

    const listings = await walk(readPage, { maxPages: 3 });

    expect(ids(listings)).toEqual(['a', 'b']);
    expect(readPage).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('result page 2 could not be read'), 'blocked');
  });

  it('keeps the earlier pages when a later page cannot be loaded', async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ listings: [{ id: 'a' }] })
      .mockResolvedValueOnce(null);

    expect(ids(await walk(readPage, { maxPages: 3 }))).toEqual(['a']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('keeping the 1 listing(s)'));
  });

  it('hands a failing first page to the caller unchanged, exactly as a single page read did', async () => {
    const readPage = vi.fn().mockRejectedValue(new Error('down'));

    await expect(walk(readPage, { maxPages: 3 })).rejects.toThrow('down');
  });

  it('pauses before every page after the first', async () => {
    vi.useFakeTimers();
    const readPage = searchOf([['a'], ['b']]);

    const walking = walkResultPages({
      readPage,
      idOf: (raw) => raw.id,
      budget: { maxPages: 2, pauseMs: 5_000 },
      label: 'test',
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(readPage).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ids(await walking)).toEqual(['a', 'b']);
  });
});

describe('resolveMaxResultPages', () => {
  it('falls back to the default when nothing is stored', () => {
    expect(resolveMaxResultPages(undefined)).toBe(DEFAULT_MAX_RESULT_PAGES);
    expect(resolveMaxResultPages(null)).toBe(DEFAULT_MAX_RESULT_PAGES);
    expect(resolveMaxResultPages('')).toBe(DEFAULT_MAX_RESULT_PAGES);
  });

  it('reads a stored number, whether it arrives as a number or a string', () => {
    expect(resolveMaxResultPages(5)).toBe(5);
    expect(resolveMaxResultPages('2')).toBe(2);
  });

  it('keeps a value written by hand within the allowed range', () => {
    expect(resolveMaxResultPages(0)).toBe(1);
    expect(resolveMaxResultPages(-3)).toBe(1);
    expect(resolveMaxResultPages(500)).toBe(MAX_RESULT_PAGES_LIMIT);
  });

  it('ignores a value that is not a whole number', () => {
    expect(resolveMaxResultPages('many')).toBe(DEFAULT_MAX_RESULT_PAGES);
    expect(resolveMaxResultPages(2.5)).toBe(DEFAULT_MAX_RESULT_PAGES);
  });
});
