/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
    withTransaction: (cb) => db.transaction(() => cb(db))(),
  },
}));

vi.mock('../../lib/services/storage/settingsStorage.js', () => ({
  getSettings: async () => ({ demoMode: false }),
  getUserSettings: () => ({}),
  upsertSettings: () => {},
}));

const ALICE = { id: 'u1', username: 'alice', isAdmin: false };

/**
 * A job's own interval travels from the form through the route into the table and back. The floor
 * is enforced here, at the one door every client comes through, rather than trusted to the form.
 */
describe('POST /api/jobs - intervalMinutes', () => {
  let app;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY, user_id TEXT, enabled INTEGER DEFAULT 1, name TEXT, blacklist TEXT, provider TEXT,
        notification_adapter TEXT, shared_with_user TEXT DEFAULT '[]', spatial_filter TEXT, spec_filter TEXT,
        commute_filter TEXT, deal_type TEXT, last_run_at INTEGER, interval_minutes INTEGER
      );
      CREATE TABLE configured_adapter (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, adapter_id TEXT NOT NULL, name TEXT NOT NULL,
        fields TEXT NOT NULL DEFAULT '{}', visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE listings (job_id TEXT, is_active INTEGER, manually_deleted INTEGER);
    `);
    const plugin = (await import('../../lib/api/routes/jobRouter.js')).default;
    app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.currentUser = ALICE;
      request.session = { currentUser: ALICE.id };
    });
    await app.register(plugin, { prefix: '/api/jobs' });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const save = (extra) =>
    app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { jobId: 'j1', name: 'Köln', provider: [], notificationAdapter: [], dealType: 'rent', ...extra },
    });

  const stored = () => db.prepare(`SELECT interval_minutes AS intervalMinutes FROM jobs WHERE id = 'j1'`).get();

  it('stores an interval of its own and serves it back', async () => {
    expect((await save({ intervalMinutes: 15 })).statusCode).toBe(200);

    const jobs = (await app.inject({ method: 'GET', url: '/api/jobs' })).json();
    expect(jobs.find((job) => job.id === 'j1').intervalMinutes).toBe(15);
  });

  it('leaves a job without one on the global interval', async () => {
    expect((await save({})).statusCode).toBe(200);
    expect(stored()).toEqual({ intervalMinutes: null });
  });

  it('clears an interval sent back empty', async () => {
    await save({ intervalMinutes: 15 });
    expect((await save({ intervalMinutes: '' })).statusCode).toBe(200);
    expect(stored()).toEqual({ intervalMinutes: null });
  });

  it('refuses an interval below the floor, and writes nothing', async () => {
    const response = await save({ intervalMinutes: 3 });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/between 5 and 1440/);
    expect(stored()).toBeUndefined();
  });

  it('refuses a fraction of a minute', async () => {
    expect((await save({ intervalMinutes: 7.5 })).statusCode).toBe(400);
  });

  it('hands the scheduler the enabled jobs with an interval of their own, and nothing else', async () => {
    await save({ intervalMinutes: 15 });
    await save({ jobId: 'global', intervalMinutes: null });
    await save({ jobId: 'paused', intervalMinutes: 20, enabled: false });
    db.prepare(`UPDATE jobs SET last_run_at = 1234 WHERE id = 'j1'`).run();

    const { getJobsWithOwnInterval } = await import('../../lib/services/storage/jobStorage.js');
    expect(getJobsWithOwnInterval()).toEqual([{ id: 'j1', intervalMinutes: 15, lastRunAt: 1234 }]);
  });
});
