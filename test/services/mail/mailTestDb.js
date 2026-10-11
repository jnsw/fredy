/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import Database from 'better-sqlite3';
import { up as mailInbox } from '../../../lib/services/storage/migrations/sql/62.mail-inbox.js';
import { up as mailListingMatches } from '../../../lib/services/storage/migrations/sql/63.mail-listing-matches.js';

/**
 * An in-memory database holding the tables the mail features touch: the real mail migrations on
 * top of a cut-down version of the tables they reference.
 *
 * Foreign keys are on, as they are on every real connection, so cascades are tested rather than
 * assumed.
 *
 * @returns {import('better-sqlite3').Database}
 */
export function createMailTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, is_admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT, shared_with_user TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE listings (
      id TEXT PRIMARY KEY, created_at INTEGER, hash TEXT, provider TEXT, job_id TEXT, price INTEGER,
      size INTEGER, rooms REAL, title TEXT, image_url TEXT, description TEXT, address TEXT, link TEXT,
      manually_deleted INTEGER NOT NULL DEFAULT 0, status JSON
    );
    CREATE TABLE watch_list (
      id TEXT PRIMARY KEY, listing_id TEXT NOT NULL, user_id TEXT NOT NULL, UNIQUE (listing_id, user_id)
    );
  `);
  mailInbox(db);
  mailListingMatches(db);
  return db;
}

/**
 * A stand-in for `SqliteConnection` that runs against the given database.
 *
 * @param {() => import('better-sqlite3').Database} getDb
 * @returns {{default: Object}}
 */
export function sqliteConnectionMock(getDb) {
  return {
    default: {
      query: (sql, params = {}) => getDb().prepare(sql).all(params),
      execute: (sql, params = {}) => getDb().prepare(sql).run(params),
      withTransaction: (callback) => getDb().transaction(() => callback(getDb()))(),
    },
  };
}
