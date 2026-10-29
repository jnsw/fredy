/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMailTestDb } from '../services/mail/mailTestDb.js';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', async () =>
  (await import('../services/mail/mailTestDb.js')).sqliteConnectionMock(() => db),
);
vi.mock('../../lib/services/similarity-check/similarityCache.js', () => ({ removeEntry: vi.fn() }));

const storage = await import('../../lib/services/storage/listingsStorage.js');

const statusOf = (id) => JSON.parse(db.prepare(`SELECT status FROM listings WHERE id = ?`).get(id).status);
const setRawStatus = (id, status) =>
  db.prepare(`UPDATE listings SET status = ? WHERE id = ?`).run(JSON.stringify(status), id);

/**
 * The application stages beyond applied/rejected/accepted, and the viewing appointment that rides
 * along inside the status.
 */
describe('listing status stages and viewings', () => {
  beforeEach(() => {
    db = createMailTestDb();
    db.exec(`
      INSERT INTO jobs (id, user_id, name, shared_with_user) VALUES
        ('own', 'u1', 'mine', '[]'),
        ('shared', 'u2', 'theirs', '["u1"]'),
        ('foreign', 'u3', 'other', '[]');
      INSERT INTO listings (id, job_id, title, created_at) VALUES
        ('a', 'own', 'A', 1), ('b', 'own', 'B', 1), ('c', 'shared', 'C', 1),
        ('d', 'foreign', 'D', 1), ('e', 'own', 'E', 1);
    `);
  });

  afterEach(() => db.close());

  it('accepts every stage an application goes through', () => {
    for (const status of ['applied', 'documents_sent', 'invited', 'visited', 'accepted', 'rejected', 'not_invited']) {
      expect(storage.setListingStatus('a', status)).toBe(1);
      expect(statusOf('a').status).toBe(status);
    }
    expect(() => storage.setListingStatus('a', 'maybe')).toThrow(/Invalid listing status/);
  });

  it('keeps the appointment from invited to visited, and drops it for anything else', () => {
    setRawStatus('a', { status: 'invited', setAt: 1, appointmentAt: 1_790_000_000_000 });

    storage.setListingStatus('a', 'visited');
    expect(statusOf('a')).toMatchObject({ status: 'visited', appointmentAt: 1_790_000_000_000 });

    storage.setListingStatus('a', 'accepted');
    expect(statusOf('a')).not.toHaveProperty('appointmentAt');
  });

  it('sets and clears an appointment only on a viewing status', () => {
    storage.setListingStatus('a', 'invited');

    expect(storage.setListingAppointment('a', 1_790_000_000_000)).toBe(true);
    expect(statusOf('a').appointmentAt).toBe(1_790_000_000_000);
    expect(storage.setListingAppointment('a', null)).toBe(true);
    expect(statusOf('a')).not.toHaveProperty('appointmentAt');

    storage.setListingStatus('b', 'applied');
    expect(storage.setListingAppointment('b', 1_790_000_000_000)).toBe(false);
    expect(storage.setListingAppointment('missing', 1_790_000_000_000)).toBe(false);
  });

  it('lists the viewings a user can see, soonest first and undated last', () => {
    setRawStatus('a', { status: 'invited', setAt: 1, appointmentAt: 2_000 });
    setRawStatus('b', { status: 'visited', setAt: 1, appointmentAt: 1_000 });
    setRawStatus('c', { status: 'invited', setAt: 1 });
    setRawStatus('d', { status: 'invited', setAt: 1, appointmentAt: 500 });
    setRawStatus('e', { status: 'applied', setAt: 1 });

    const viewings = storage.getViewings('u1');

    expect(viewings.map((viewing) => viewing.id)).toEqual(['b', 'a', 'c']);
    expect(viewings[0]).toMatchObject({ appointmentAt: 1_000, status: { status: 'visited' } });
    expect(viewings[2].appointmentAt).toBeNull();
  });
});
