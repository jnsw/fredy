/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * The currency a listing's price is written in.
 *
 * Until now every price was taken to be euros, and every screen and notification printed a euro sign
 * behind it - including Flatfox's Swiss rents, which are francs. The column lets every reader of
 * `price` know which kind of number it holds: the label that prints it, the median that must not be
 * taken over francs and euros together, the finance model that only lends in euros.
 *
 * Every existing row gets `EUR`, which is what Fredy took it to be, with the two exceptions whose
 * prices were never euros: Flatfox (Switzerland only) and the Swiss site of BETTERHOMES, which runs
 * one application on `.de`, `.at` and `.ch` and whose stored links say which site an advert is on.
 * Both are named here rather than asked of the provider modules because those load after the
 * migrations have run, and a migration states what was true when it shipped.
 *
 * The pipeline writes the column for every listing it stores from now on, from the provider's
 * `metaInformation.currency` (see `lib/services/providers/currencies.js`).
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {void}
 */
export function up(db) {
  const columns = db.prepare(`PRAGMA table_info(listings)`).all();
  if (columns.some((column) => column.name === 'currency')) {
    return;
  }

  db.exec(`ALTER TABLE listings ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR'`);
  db.exec(`
    UPDATE listings
    SET currency = 'CHF'
    WHERE provider = 'flatfox'
       OR (provider = 'betterhomes' AND (link LIKE 'https://www.betterhomes.ch/%' OR link LIKE 'https://betterhomes.ch/%'))
  `);
}
