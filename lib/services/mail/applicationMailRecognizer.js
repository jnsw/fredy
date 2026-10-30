/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { normalizeMailMatchText } from './mailListingMatcher.js';

/**
 * Reads the stage of an application out of a landlord's German reply.
 *
 * Only strong, specific phrases count - "Einladung zum Besichtigungstermin", not "Termin";
 * "Unterlagen hochladen", not "Unterlagen". A reply that matches nothing changes nothing, which is
 * the right failure: the user still sets the status by hand, as before. What is recognised is only
 * ever applied forward (see `mayAdvanceStatus`), so a late acknowledgement cannot undo an
 * invitation.
 *
 * German only, because the portals Fredy covers in Germany are where applications are made by
 * email; other languages simply recognise nothing.
 */

/** Appointments in German mail are Berlin time, whatever time zone the server runs in. */
const MAIL_TIME_ZONE = 'Europe/Berlin';

const INVITATION = [
  /\bterminbestatigung\b/,
  /\bterminerinnerung\b/,
  /\berinnerung besichtigungstermin\b/,
  /\beinladung zum besichtigungstermin\b/,
  /\beinladung zu einem besichtigungstermin\b/,
  /\beinladung zur (?:wohnungs)?besichtigung\b/,
  /\beinladung terminbuchung\b/,
  /\bbesichtigungstermin (?:bestatigen|bestatigt)\b/,
];

const DOCUMENTS = [
  /\bformularbestatigung\b/,
  /\bunterlagen (?:hochladen|einreichen|ubermitteln|zukommen lassen)\b/,
  /\berforderl(?:iche|ich)? unterlag/,
  /\b(?:einkommensnachweis|einkommensnachweise|schufa|mietschuldenfreiheitsbescheinigung|mietschuldenfreiheit)\b/,
];

const NOT_INVITED = [
  /\b(?:konnten|kann|konnen) wir ihre anfrage (?:leider )?nicht berucksichtigen\b/,
  /\bihre anfrage (?:leider )?nicht berucksichtigen\b/,
  /\bnicht fur einen besichtigungstermin berucksichtigen\b/,
];

const APPLIED = [
  /\banfragebestatigung\b/,
  /\bbestatigung ihrer anfrage\b/,
  /\bwir freuen uns uber ihre anfrage\b/,
  /\bihre anfrage weiter bearbeiten\b/,
];

/**
 * Epoch milliseconds for a wall-clock time in a time zone.
 *
 * @param {number} year
 * @param {number} month - 1 to 12.
 * @param {number} day
 * @param {number} hour
 * @param {number} minute
 * @param {string} [timeZone]
 * @returns {number|null}
 */
export function wallClockToEpoch(year, month, day, hour, minute, timeZone = MAIL_TIME_ZONE) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value]),
  );
  const shown = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return guess - (shown - guess);
}

/**
 * The first "dd.mm.yyyy [um] hh:mm" in a text, as Berlin time.
 *
 * @param {string} raw
 * @returns {number|null}
 */
function findAppointment(raw) {
  const match = raw.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\s*,?\s*(?:um\s+)?(\d{1,2})[:.](\d{2})\s*(?:uhr)?\b/i);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match.map(Number);
  return wallClockToEpoch(year, month, day, hour, minute);
}

/**
 * The application stage a German reply announces, if it announces one clearly.
 *
 * @param {unknown} subject
 * @param {unknown} body
 * @returns {{status: 'invited'|'documents_sent'|'not_invited'|'applied', appointmentAt?: number}|null}
 */
export function recognizeApplicationUpdate(subject, body) {
  const raw = [subject, body].filter(Boolean).join('\n');
  const text = normalizeMailMatchText(raw);
  if (!text) return null;
  const matches = (patterns) => patterns.some((pattern) => pattern.test(text));

  if (matches(INVITATION)) {
    const appointmentAt = findAppointment(raw);
    return appointmentAt == null ? { status: 'invited' } : { status: 'invited', appointmentAt };
  }
  if (matches(DOCUMENTS)) return { status: 'documents_sent' };
  if (matches(NOT_INVITED)) return { status: 'not_invited' };
  if (matches(APPLIED)) return { status: 'applied' };
  return null;
}
