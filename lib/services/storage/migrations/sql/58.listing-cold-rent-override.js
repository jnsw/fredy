/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The cold rent of a purchase, as the user knows it.
 *
 * The estimate from migration 57 is a median over a neighbourhood. Somebody who has asked the agent,
 * read the exposé or knows the building has a better figure, and the yield should be computed from
 * that one. A monthly EUR amount rather than a rate per square metre, because that is the number an
 * exposé or a rent roll states.
 *
 * NULL means "use the estimate", which is what every listing had before this column existed.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (!columns.some((column) => column.name === 'cold_rent_override')) {
    db.exec(`ALTER TABLE listings ADD COLUMN cold_rent_override REAL`);
  }
}
