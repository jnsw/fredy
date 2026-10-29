/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import {
  LISTING_STATUSES,
  STATUS_RANK,
  buildStatusPayload,
  mayAdvanceStatus,
  normalizeAppointment,
  normalizeListingStatus,
} from '../../../lib/services/listings/listingStatus.js';

describe('listingStatus', () => {
  it('keeps the three statuses existing installations already store', () => {
    for (const status of ['applied', 'rejected', 'accepted']) {
      expect(LISTING_STATUSES).toContain(status);
    }
  });

  it('ranks every status', () => {
    expect(Object.keys(STATUS_RANK).sort()).toEqual([...LISTING_STATUSES].sort());
  });

  it('normalises case and refuses anything else', () => {
    expect(normalizeListingStatus(' Invited ')).toBe('invited');
    expect(normalizeListingStatus('maybe')).toBeNull();
    expect(normalizeListingStatus(null)).toBeNull();
  });

  it('reads an appointment only from a positive number', () => {
    expect(normalizeAppointment('1790000000000')).toBe(1_790_000_000_000);
    expect(normalizeAppointment('')).toBeNull();
    expect(normalizeAppointment(-5)).toBeNull();
    expect(normalizeAppointment('soon')).toBeNull();
  });

  it('carries an appointment between the two viewing statuses only', () => {
    const invited = { status: 'invited', setAt: 1, appointmentAt: 99 };

    expect(buildStatusPayload(invited, 'visited', { now: 2 })).toEqual({
      status: 'visited',
      setAt: 2,
      appointmentAt: 99,
    });
    expect(buildStatusPayload(invited, 'rejected', { now: 2 })).toEqual({ status: 'rejected', setAt: 2 });
    expect(buildStatusPayload(invited, 'invited', { appointmentAt: 120, now: 2 })).toEqual({
      status: 'invited',
      setAt: 2,
      appointmentAt: 120,
    });
    expect(buildStatusPayload(invited, null)).toBeNull();
  });

  it('only lets a mail move a listing forward', () => {
    expect(mayAdvanceStatus(null, 'applied')).toBe(true);
    expect(mayAdvanceStatus('applied', 'invited')).toBe(true);
    expect(mayAdvanceStatus('invited', 'invited')).toBe(true);
    expect(mayAdvanceStatus('invited', 'applied')).toBe(false);
    expect(mayAdvanceStatus('documents_sent', 'applied')).toBe(false);
    expect(mayAdvanceStatus('invited', 'not_invited')).toBe(true);
    expect(mayAdvanceStatus('accepted', 'invited')).toBe(false);
  });
});
