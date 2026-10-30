/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

import { up as addAiRatingSettings } from '../../../lib/services/storage/migrations/sql/61.ai-rating-settings.js';

/**
 * The AI settings table against a real database. What matters most is what never leaves it: the
 * key is in the row and nowhere in the shape the API sends.
 */
describe('aiRatingSettingsStorage', () => {
  let db;
  let storage;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE listings (id TEXT PRIMARY KEY);
      INSERT INTO users (id) VALUES ('u1'), ('u2');
    `);
    addAiRatingSettings(db);

    vi.resetModules();
    vi.doMock('../../../lib/services/storage/SqliteConnection.js', () => ({
      default: {
        query: (sql, params) => db.prepare(sql).all(params ?? {}),
        execute: (sql, params) => db.prepare(sql).run(params ?? {}),
      },
    }));
    storage = await import('../../../lib/services/storage/aiRatingSettingsStorage.js');
  });

  afterEach(() => db.close());

  const save = (values, now) =>
    storage.saveAiRatingSettings('u1', { provider: 'anthropic', apiKey: 'sk-ant-secret', ...values }, now);

  it('stores the settings and reads them back, key included, for the server', () => {
    save({ model: 'claude-opus-5-5', instructions: 'Balcony please.', dailyLimit: 20 }, 100);

    expect(storage.getAiRatingSettings('u1')).toMatchObject({
      userId: 'u1',
      provider: 'anthropic',
      apiKey: 'sk-ant-secret',
      model: 'claude-opus-5-5',
      instructions: 'Balcony please.',
      autoRate: false,
      autoRateSince: null,
      dailyLimit: 20,
    });
  });

  it('never puts the key into the shape the API sends', () => {
    save({}, 100);

    const shown = storage.toPublicAiRatingSettings(storage.getAiRatingSettings('u1'));

    expect(shown.hasApiKey).toBe(true);
    expect(shown).not.toHaveProperty('apiKey');
    expect(JSON.stringify(shown)).not.toContain('sk-ant-secret');
  });

  it('starts automatic rating at the moment it is switched on, and keeps that moment on later saves', () => {
    save({ autoRate: true }, 1_000);
    expect(storage.getAiRatingSettings('u1').autoRateSince).toBe(1_000);

    save({ autoRate: true, model: 'claude-sonnet-5-5' }, 2_000);
    expect(storage.getAiRatingSettings('u1').autoRateSince).toBe(1_000);

    save({ autoRate: false }, 3_000);
    expect(storage.getAiRatingSettings('u1').autoRateSince).toBeNull();

    // Back on: listings found while it was off are not suddenly sent.
    save({ autoRate: true }, 4_000);
    expect(storage.getAiRatingSettings('u1').autoRateSince).toBe(4_000);
  });

  it('offers only switched-on, keyed, unpaused users to the background run', () => {
    save({ autoRate: true }, 1_000);
    storage.saveAiRatingSettings('u2', { provider: 'anthropic', apiKey: 'k2', autoRate: false }, 1_000);

    expect(storage.getAutoRatingSettings(2_000).map((s) => s.userId)).toEqual(['u1']);

    storage.pauseAiRating('u1', 5_000, 'Rate limited');
    expect(storage.getAutoRatingSettings(4_999)).toEqual([]);
    expect(storage.getAutoRatingSettings(5_000).map((s) => s.userId)).toEqual(['u1']);
  });

  it('keeps a pause that waits for the user until they save again', () => {
    save({ autoRate: true }, 1_000);
    storage.pauseAiRating('u1', storage.PAUSED_UNTIL_SAVED, 'invalid x-api-key');

    expect(storage.getAutoRatingSettings(Date.now())).toEqual([]);
    expect(storage.getAiRatingSettings('u1').lastError).toBe('invalid x-api-key');

    save({ autoRate: true, apiKey: 'sk-ant-new' }, 2_000);
    expect(storage.getAiRatingSettings('u1')).toMatchObject({ pausedUntil: null, lastError: null });
    expect(storage.getAutoRatingSettings(Date.now()).map((s) => s.userId)).toEqual(['u1']);
  });

  it('lifts a pause after a rating went through', () => {
    save({ autoRate: true }, 1_000);
    storage.pauseAiRating('u1', 9_000, 'Overloaded');

    storage.clearAiRatingPause('u1');

    expect(storage.getAiRatingSettings('u1')).toMatchObject({ pausedUntil: null, lastError: null });
  });

  it('deletes the settings, and the key goes with the user', () => {
    save({}, 1_000);
    storage.saveAiRatingSettings('u2', { provider: 'anthropic', apiKey: 'k2' }, 1_000);

    expect(storage.deleteAiRatingSettings('u1')).toBe(1);
    expect(storage.getAiRatingSettings('u1')).toBeNull();

    db.prepare(`DELETE FROM users WHERE id = 'u2'`).run();
    expect(db.prepare(`SELECT COUNT(1) AS cnt FROM ai_rating_settings`).get().cnt).toBe(0);
  });

  it('adds the failure counter to listings, starting at zero', () => {
    db.prepare(`INSERT INTO listings (id) VALUES ('l1')`).run();
    expect(db.prepare(`SELECT ai_rating_failures FROM listings`).get().ai_rating_failures).toBe(0);
  });
});
