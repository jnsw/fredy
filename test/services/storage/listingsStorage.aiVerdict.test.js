/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as addAiVerdictColumns } from '../../../lib/services/storage/migrations/sql/60.listing-ai-verdict.js';

/**
 * The AI verdict columns against a real table: what is written, what is cleared with it, and which
 * rows each value of the filter returns.
 */
describe('AI verdict in the listings table', () => {
  let db;
  let listingsStorage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, deal_type TEXT, shared_with_user TEXT DEFAULT '[]');
      CREATE TABLE watch_list (id TEXT PRIMARY KEY, listing_id TEXT, user_id TEXT);
      CREATE TABLE listing_attachments (id TEXT PRIMARY KEY, listing_id TEXT);
      CREATE TABLE listing_travel_times (listing_id TEXT, label TEXT);
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        title TEXT,
        status TEXT,
        created_at INTEGER,
        published_at INTEGER,
        manually_deleted INTEGER DEFAULT 0
      );
    `);
    addAiVerdictColumns(db);
    db.prepare(`INSERT INTO jobs (id, user_id, name) VALUES ('job-1', 'u1', 'Berlin')`).run();

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        getConnection: () => db,
        query: (sql, params) => db.prepare(sql).all(params ?? {}),
        execute: (sql, params) => db.prepare(sql).run(params ?? {}),
        withTransaction: (callback) => db.transaction(() => callback(db))(),
      },
    }));
    vi.doMock('../../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));
    listingsStorage = await import('../../../lib/services/storage/listingsStorage.js');
  });

  afterEach(() => db.close());

  const addListing = (id, verdict = null) =>
    db
      .prepare(`INSERT INTO listings (id, job_id, title, created_at, ai_verdict) VALUES (?, 'job-1', ?, ?, ?)`)
      .run(id, `Listing ${id}`, Date.now(), verdict);

  const rowOf = (id) => db.prepare(`SELECT * FROM listings WHERE id = ?`).get(id);

  const idsFor = (aiVerdictFilter) =>
    listingsStorage
      .queryListings({ aiVerdictFilter, userId: 'u1' })
      .result.map((row) => row.id)
      .sort();

  it('stores verdict, reasoning, source and time together', () => {
    addListing('a');

    expect(
      listingsStorage.setListingAiVerdict('a', { verdict: 'GOOD', reason: '  Quiet street. ', source: 'mcp' }, 42),
    ).toBe(1);

    expect(rowOf('a')).toMatchObject({
      ai_verdict: 'good',
      ai_verdict_reason: 'Quiet street.',
      ai_verdict_source: 'mcp',
      ai_verdict_at: 42,
    });
  });

  it('replaces the reasoning along with the verdict, rather than keeping an old one next to it', () => {
    addListing('a');
    listingsStorage.setListingAiVerdict('a', { verdict: 'good', reason: 'Old reason', source: 'mcp' });

    listingsStorage.setListingAiVerdict('a', { verdict: 'bad', source: 'claude-opus-5-5' });

    expect(rowOf('a')).toMatchObject({
      ai_verdict: 'bad',
      ai_verdict_reason: null,
      ai_verdict_source: 'claude-opus-5-5',
    });
  });

  it('clears all four columns on null', () => {
    addListing('a');
    listingsStorage.setListingAiVerdict('a', { verdict: 'maybe', reason: 'Hm.', source: 'mcp' });

    listingsStorage.setListingAiVerdict('a', null);

    expect(rowOf('a')).toMatchObject({
      ai_verdict: null,
      ai_verdict_reason: null,
      ai_verdict_source: null,
      ai_verdict_at: null,
    });
  });

  it('cuts an overlong reasoning instead of storing it whole', () => {
    addListing('a');
    listingsStorage.setListingAiVerdict('a', { verdict: 'good', reason: 'x'.repeat(5000) });
    expect(rowOf('a').ai_verdict_reason).toHaveLength(2000);
  });

  it('refuses anything that is not a verdict', () => {
    addListing('a');
    expect(() => listingsStorage.setListingAiVerdict('a', { verdict: 'excellent' })).toThrow(/Invalid AI verdict/);
    expect(rowOf('a').ai_verdict).toBeNull();
  });

  it('reports 0 for a listing that does not exist', () => {
    expect(listingsStorage.setListingAiVerdict('missing', { verdict: 'good' })).toBe(0);
  });

  it('filters on each verdict, on "not rated", and on nothing', () => {
    addListing('g', 'good');
    addListing('m', 'maybe');
    addListing('b', 'bad');
    addListing('n', null);

    expect(idsFor('good')).toEqual(['g']);
    expect(idsFor('MAYBE')).toEqual(['m']);
    expect(idsFor('bad')).toEqual(['b']);
    expect(idsFor('none')).toEqual(['n']);
    expect(idsFor(null)).toEqual(['b', 'g', 'm', 'n']);
    // Not a verdict: ignored rather than matching nothing.
    expect(idsFor('excellent')).toEqual(['b', 'g', 'm', 'n']);
  });

  it('keeps the user scoping when filtering', () => {
    db.prepare(`INSERT INTO jobs (id, user_id, name) VALUES ('job-2', 'u2', 'Hamburg')`).run();
    db.prepare(`INSERT INTO listings (id, job_id, title, ai_verdict) VALUES ('foreign', 'job-2', 'x', 'good')`).run();
    addListing('mine', 'good');

    expect(idsFor('good')).toEqual(['mine']);
  });

  it('is a no-op when the migration runs again', () => {
    expect(() => addAiVerdictColumns(db)).not.toThrow();
  });
});
