/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { recognizeApplicationUpdate, wallClockToEpoch } from '../../../lib/services/mail/applicationMailRecognizer.js';

describe('recognizeApplicationUpdate', () => {
  it('reads an invitation and its appointment as Berlin time', () => {
    expect(
      recognizeApplicationUpdate(
        'Terminbestätigung – Objektnummer 1000/00185/0101/0218',
        'Der Termin für das Objekt findet am 11.08.2026 um 13:30 Uhr statt.',
      ),
    ).toEqual({ status: 'invited', appointmentAt: Date.parse('2026-08-11T11:30:00Z') });
  });

  it('uses winter time in winter', () => {
    expect(wallClockToEpoch(2026, 12, 3, 9, 0)).toBe(Date.parse('2026-12-03T08:00:00Z'));
  });

  it('refuses an impossible date instead of inventing one', () => {
    expect(recognizeApplicationUpdate('Einladung zum Besichtigungstermin', 'am 41.13.2026 um 25:00')).toEqual({
      status: 'invited',
    });
  });

  it.each([
    'Einladung zum Besichtigungstermin - Immobilienanfrage',
    'Terminerinnerung - Immobilienanfrage',
    'Erinnerung Besichtigungstermin - Musterweg 1',
    'Terminbestätigung: Musterstr. 21, 12345 Musterstadt',
    'Einladung Terminbuchung Musterallee 95',
    'Einladung zu einem Besichtigungstermin Musterplatz 48',
    'Einladung zur Wohnungsbesichtigung',
  ])('recognises the invitation subject "%s"', (subject) => {
    expect(recognizeApplicationUpdate(subject, 'Wir freuen uns auf Ihren Besuch.')).toEqual({ status: 'invited' });
  });

  it('recognises a request for documents, and not the word on its own', () => {
    expect(
      recognizeApplicationUpdate(
        'Neue Nachricht',
        'Bitte verwenden Sie das Formular, um folgende Unterlagen hochzuladen: Einkommen, Schufa, Mietschuldenfreiheit.',
      ),
    ).toEqual({ status: 'documents_sent' });
    expect(recognizeApplicationUpdate('Mietobjekt Musterstr. 95 Erforderl. Unterlag', 'Guten Tag')).toEqual({
      status: 'documents_sent',
    });
    expect(recognizeApplicationUpdate('Unterlagen zu Ihrer Information', 'Vielen Dank.')).toBeNull();
  });

  it('recognises a rejection before any viewing', () => {
    expect(
      recognizeApplicationUpdate(
        'Ihre Anfrage',
        'Auf Grund der hohen Anzahl an Interessenten konnten wir Ihre Anfrage nicht berücksichtigen.',
      ),
    ).toEqual({ status: 'not_invited' });
  });

  it('recognises an acknowledgement', () => {
    expect(recognizeApplicationUpdate('Bestätigung Ihrer Anfrage - Immobilienanfrage', 'Vielen Dank.')).toEqual({
      status: 'applied',
    });
    expect(recognizeApplicationUpdate('Ihre Anfrage', 'Wir freuen uns über Ihre Anfrage.')).toEqual({
      status: 'applied',
    });
  });

  it('reads nothing into generic portal mail', () => {
    expect(
      recognizeApplicationUpdate('Ihre persönliche Vorstellung beim Anbieter', 'Die Nr. 1 für Immobilien'),
    ).toBeNull();
    expect(recognizeApplicationUpdate('Neue Angebote für Ihre Suche', 'Termin vereinbaren')).toBeNull();
    expect(recognizeApplicationUpdate(null, null)).toBeNull();
  });
});
