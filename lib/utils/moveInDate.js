/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * When a flat can be moved into, as the portals state it, and the job filter that compares it.
 *
 * A move-in date is a calendar date, never an instant: "bezugsfrei ab 01.10.2026" means that day
 * wherever the reader sits. It is therefore kept as `YYYY-MM-DD` everywhere - on the listing, in the
 * job's spec filter and in the comparison - where string order is calendar order and no time zone
 * can move it by a day.
 */

/** German month names, for "Oktober 2026" and "1. Oktober 2026". */
const GERMAN_MONTHS = {
  januar: 1,
  jänner: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

/** `2026-10-01`, also when a time follows it. */
const ISO_DATE = /\b(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;

/**
 * `01.10.2026`, `1.10.26`. The year is required: ImmoScout sellers write `01.09./15.09.` into the
 * field as often as a real date, and guessing which year they meant would be inventing one.
 */
const GERMAN_DATE = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/;

/** `Oktober 2026`, `1. Oktober 2026`. A month without a day means its first. */
const GERMAN_MONTH_DATE = new RegExp(
  `(?:\\b(\\d{1,2})\\.?\\s*)?\\b(${Object.keys(GERMAN_MONTHS).join('|')})\\s+(\\d{4})(?!\\d)`,
  'i',
);

/** "Free now", in the words the portals use. Read as today. */
const IMMEDIATELY = /\bsofort\b|\bimmediately\b/i;

/** A move-in date as the job form stores it. Strict, since it arrives from outside. */
const STRICT_ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {number} value
 * @returns {string}
 */
const pad = (value) => String(value).padStart(2, '0');

/**
 * A real calendar date as `YYYY-MM-DD`, or null for one that does not exist (`31.02.2026`) or lies
 * outside any plausible tenancy. The year range is what turns the `0001-01-01` and `9999-12-31`
 * placeholders some APIs send for "no date" into no date.
 *
 * @param {number} year
 * @param {number} month One-based.
 * @param {number} day
 * @returns {string|null}
 */
function calendarDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Turn what a portal states as the move-in date into `YYYY-MM-DD`.
 *
 * Reads, in this order: an ISO date (`2026-10-01`, `2026-10-01T00:00:00Z`), a German numeric date
 * (`01.10.2026`, `1.10.26`), a German month (`Oktober 2026`, `1. Oktober 2026` - a month alone means
 * its first day), and "sofort" / "ab sofort", which is today. The first date in the text wins, so a
 * period such as WG-Gesucht's `01.08.2026 - 31.12.2026` reads as its start.
 *
 * Everything else - "nach Vereinbarung", "flexibel", an empty field, a day without a year - is no
 * date at all, and the caller must treat it as unknown rather than as any particular day.
 *
 * @param {unknown} value What the portal states.
 * @param {Date} [now] The clock "sofort" is read against, injectable for tests.
 * @returns {string|null} The date, or null when the value names none.
 */
export function normalizeMoveInDate(value, now = new Date()) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '') return null;

  const iso = ISO_DATE.exec(text);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const german = GERMAN_DATE.exec(text);
  if (german) {
    const year = german[3].length === 2 ? 2000 + Number(german[3]) : Number(german[3]);
    return calendarDate(year, Number(german[2]), Number(german[1]));
  }

  const monthName = GERMAN_MONTH_DATE.exec(text);
  if (monthName) {
    const day = monthName[1] == null ? 1 : Number(monthName[1]);
    return calendarDate(Number(monthName[3]), GERMAN_MONTHS[monthName[2].toLowerCase()], day);
  }

  if (IMMEDIATELY.test(text)) {
    return moveInToday(now);
  }

  return null;
}

/**
 * Today as a move-in date, which is what "sofort" means.
 *
 * The server's own calendar day: a listing that is free now is free on whichever day it is where
 * Fredy runs, and that is also the day the user picks their window against.
 *
 * @param {Date} [now] Injectable for tests.
 * @returns {string} `YYYY-MM-DD`.
 */
export function moveInToday(now = new Date()) {
  return calendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * A job's move-in window.
 *
 * @typedef {Object} MoveInWindow
 * @property {string|null} earliest First acceptable move-in date, `YYYY-MM-DD`, or null for open.
 * @property {string|null} latest Last acceptable move-in date, `YYYY-MM-DD`, or null for open.
 * @property {boolean} dateRequired Whether a listing stating no move-in date is left out as well.
 */

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function strictIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = STRICT_ISO_DATE.exec(value.trim());
  return match == null ? null : calendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * Read the move-in window out of a job's spec filter.
 *
 * Normalised here rather than trusted, because the spec filter is stored as the form or the API sent
 * it. A bound that is not a real date is ignored rather than failing the run, and a window entered the
 * wrong way round still means the window between its two dates. `moveInDateRequired` narrows a window
 * and means nothing without one, so a filter carrying only the flag is no filter.
 *
 * @param {import('../types/filter.js').SpecFilter|null|undefined} specFilter
 * @returns {MoveInWindow|null} Null when the job filters on no move-in date.
 */
export function normalizeMoveInWindow(specFilter) {
  let earliest = strictIsoDate(specFilter?.moveInEarliest);
  let latest = strictIsoDate(specFilter?.moveInLatest);
  if (earliest == null && latest == null) return null;
  if (earliest != null && latest != null && earliest > latest) {
    [earliest, latest] = [latest, earliest];
  }
  return { earliest, latest, dateRequired: specFilter?.moveInDateRequired === true };
}

/**
 * Whether a stated move-in date lies outside the window. Both bounds are inclusive.
 *
 * An unknown date is never outside: whether a listing without one is kept is the window's
 * `dateRequired`, which the caller decides when it knows no further date can still arrive.
 *
 * @param {string|null|undefined} availableFrom The listing's move-in date, `YYYY-MM-DD`.
 * @param {MoveInWindow|null} window
 * @returns {boolean}
 */
export function isOutsideMoveInWindow(availableFrom, window) {
  if (window == null || availableFrom == null) return false;
  return (
    (window.earliest != null && availableFrom < window.earliest) ||
    (window.latest != null && availableFrom > window.latest)
  );
}
