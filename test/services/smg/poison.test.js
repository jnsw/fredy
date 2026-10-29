/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect, vi } from 'vitest';
import {
  cheaperOf,
  judgeAnswer,
  readVerifiedPage,
  HONEST,
  POISONED,
  UNKNOWN,
  MAX_VERIFY_ATTEMPTS,
} from '../../../lib/services/smg/poison.js';

/**
 * The two value sets the SMG search answers with, in the shape it answers them: the real one, and the
 * rewritten copy with every price raised by about 27 %, the rooms changed and the net rent stripped.
 * The figures are the shape of a measured pair, not a recording.
 */
const row = (id, rent, rooms) => ({ id, listing: { id, prices: { rent }, characteristics: { numberOfRooms: rooms } } });
const buyRow = (id, price, rooms) => ({
  id,
  listing: { id, prices: { buy: { price } }, characteristics: { numberOfRooms: rooms } },
});

const REAL_RENT = [
  row('1', { gross: 1380, net: 1180, extra: 200, interval: 'MONTH' }, 3.5),
  row('2', { gross: 1150, interval: 'MONTH' }, 3.5),
];
const REWRITTEN_RENT = [
  row('1', { gross: 1750, interval: 'MONTH' }, 2.5),
  row('2', { gross: 1460, interval: 'MONTH' }, 2.5),
];

const REAL_BUY = [buyRow('1', 1690000, 4.5), buyRow('2', 1050000, 2.5)];
const REWRITTEN_BUY = [buyRow('1', 2159820, 2.5), buyRow('2', 1341900, 1.5)];

describe('judgeAnswer', () => {
  it('vouches for an answer with a single net rent, which the rewrite never leaves', () => {
    expect(judgeAnswer({ listings: REAL_RENT, query: {} }).verdict).toBe(HONEST);
  });

  it('calls an answer rewritten when a row breaks a filter the search ran with', () => {
    const verdict = judgeAnswer({ listings: REWRITTEN_RENT, query: { numberOfRooms: { from: 3 } } });
    expect(verdict.verdict).toBe(POISONED);
    expect(verdict.reason).toMatch(/numberOfRooms=2.5/);
  });

  // Measured: a real 79 m² flat comes back on a "from 80 m²" search, every time.
  it('does not take a near miss of a filter for the rewrite, which misses by far more', () => {
    const nearMiss = [{ id: '1', listing: { id: '1', characteristics: { livingSpace: 79, numberOfRooms: 3 } } }];
    expect(judgeAnswer({ listings: nearMiss, query: { livingSpace: { from: 80 } } }).verdict).toBe(UNKNOWN);
    const halved = [{ id: '1', listing: { id: '1', characteristics: { livingSpace: 42 } } }];
    expect(judgeAnswer({ listings: halved, query: { livingSpace: { from: 80 } } }).verdict).toBe(POISONED);
  });

  // A rent filter bounds the net rent, which a gross-only row does not show; measured on a real answer.
  it('does not hold a gross rent against the rent filter, but holds a purchase price against its own', () => {
    const grossOnly = [row('1', { gross: 2280, interval: 'MONTH' }, 3)];
    expect(judgeAnswer({ listings: grossOnly, query: { monthlyRent: { to: 2000 } } }).verdict).toBe(UNKNOWN);
    expect(judgeAnswer({ listings: REWRITTEN_BUY, query: { purchasePrice: { to: 1500000 } } }).verdict).toBe(POISONED);
    expect(judgeAnswer({ listings: REAL_BUY, query: { purchasePrice: { to: 1700000 } } }).verdict).toBe(UNKNOWN);
  });

  it('cannot tell anything about an answer with no net rent and no filter to break', () => {
    expect(judgeAnswer({ listings: REWRITTEN_RENT, query: {} }).verdict).toBe(UNKNOWN);
    expect(judgeAnswer({ listings: REAL_BUY, query: {} }).verdict).toBe(UNKNOWN);
  });

  it('has nothing to doubt on an empty page', () => {
    expect(judgeAnswer({ listings: [], query: { numberOfRooms: { from: 3 } } }).verdict).toBe(HONEST);
  });
});

describe('cheaperOf', () => {
  it('takes the answer whose prices the other one raises as the real one, in either order', () => {
    expect(cheaperOf(REAL_BUY, REWRITTEN_BUY)).toBe('first');
    expect(cheaperOf(REWRITTEN_BUY, REAL_BUY)).toBe('second');
  });

  it('cannot tell two copies of the same value set apart', () => {
    expect(cheaperOf(REWRITTEN_BUY, REWRITTEN_BUY)).toBeNull();
  });

  // A price can change between two requests. One advert getting cheaper is not the rewrite.
  it('is not fooled by a price that changed by less than the rewrite adds', () => {
    expect(cheaperOf([buyRow('1', 1000000, 3)], [buyRow('1', 1050000, 3)])).toBeNull();
  });
});

describe('readVerifiedPage', () => {
  /** A stand-in for the endpoint that answers the given sequence, then repeats the last answer. */
  const endpoint = (...answers) => {
    const queue = answers.map((results) => (results == null ? null : { results }));
    return vi.fn(async () => (queue.length > 1 ? queue.shift() : queue[0]));
  };

  it('keeps the first answer it can vouch for', async () => {
    const requestPage = endpoint(REAL_RENT);
    const result = await readVerifiedPage({ requestPage, body: { query: {} } });
    expect(result).toMatchObject({ answer: { results: REAL_RENT }, verdict: { verdict: HONEST }, attempts: 1 });
  });

  it('asks again while the answer breaks the filters, and keeps the real one when it comes', async () => {
    const requestPage = endpoint(REWRITTEN_RENT, REWRITTEN_RENT, REAL_RENT);
    const result = await readVerifiedPage({ requestPage, body: { query: { numberOfRooms: { from: 3 } } } });
    expect(result.answer.results).toBe(REAL_RENT);
    expect(result.attempts).toBe(3);
  });

  // A purchase has no net price, so only the two answers side by side say which is real.
  it('settles a purchase by comparing two different answers, whichever came first', async () => {
    for (const order of [
      [REWRITTEN_BUY, REAL_BUY],
      [REAL_BUY, REWRITTEN_BUY],
    ]) {
      const result = await readVerifiedPage({ requestPage: endpoint(...order), body: { query: {} } });
      expect(result.answer.results).toBe(REAL_BUY);
      expect(result.verdict.verdict).toBe(HONEST);
    }
  });

  it('never keeps an answer that broke a filter, even when it is the cheaper one', async () => {
    const cheapButBroken = [buyRow('1', 1000000, 1), buyRow('2', 900000, 1)];
    const requestPage = endpoint(cheapButBroken, REAL_BUY);
    const result = await readVerifiedPage({ requestPage, body: { query: { numberOfRooms: { from: 2 } } } });
    expect(result.verdict.verdict).not.toBe(HONEST);
  });

  it('gives the page up, unkept, when every answer is the same unverifiable one', async () => {
    const requestPage = endpoint(REWRITTEN_BUY);
    const result = await readVerifiedPage({ requestPage, body: { query: {} } });
    expect(result.verdict.verdict).toBe(POISONED);
    expect(result.attempts).toBe(MAX_VERIFY_ATTEMPTS);
    expect(requestPage).toHaveBeenCalledTimes(MAX_VERIFY_ATTEMPTS);
  });

  it('stops at once when the endpoint stops answering', async () => {
    const result = await readVerifiedPage({ requestPage: endpoint(null), body: { query: {} } });
    expect(result).toEqual({ answer: null, verdict: null, attempts: 1 });
  });
});
