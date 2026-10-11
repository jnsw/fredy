/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';

import { up } from '../../lib/services/storage/migrations/sql/59.job-interval.js';

describe('migration 59 - job interval', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`CREATE TABLE jobs (id TEXT PRIMARY KEY, name TEXT)`);
  });

  afterEach(() => db.close());

  it('adds the column', () => {
    up(db);
    const columns = db
      .prepare(`PRAGMA table_info(jobs)`)
      .all()
      .map((column) => column.name);
    expect(columns).toContain('interval_minutes');
  });

  // NULL is "follow the global interval": an upgraded instance must keep searching as it did.
  it('leaves every existing job on the global interval', () => {
    db.prepare(`INSERT INTO jobs (id, name) VALUES ('old', 'Köln')`).run();
    up(db);
    expect(db.prepare(`SELECT interval_minutes FROM jobs WHERE id = 'old'`).get()).toEqual({ interval_minutes: null });
  });

  it('is a no-op when run again', () => {
    up(db);
    expect(() => up(db)).not.toThrow();
  });
});
