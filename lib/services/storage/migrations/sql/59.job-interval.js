/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Let a job search on an interval of its own.
 *
 * `interval_minutes` is NULL for every job that has none, which is what the scheduler reads as
 * "follow the global interval from Administration → Execution". Every row stored before this
 * migration is NULL, so an upgraded instance keeps searching exactly as it did.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(jobs)`).all();
  if (!columns.some((column) => column.name === 'interval_minutes')) {
    db.exec(`ALTER TABLE jobs ADD COLUMN interval_minutes INTEGER`);
  }
}
