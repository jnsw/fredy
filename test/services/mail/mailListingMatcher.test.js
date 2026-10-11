/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/services/storage/mailStorage.js', () => ({
  assignMailMessageToListing: vi.fn(),
  getMatchedMailThreadAnchors: vi.fn(() => []),
  getOwnedListingsForMailMatching: vi.fn(() => []),
  getUnmatchedMailMessages: vi.fn(() => []),
}));

const { extractAddressVariants, extractListingCodes, matchUnmatchedMailMessages, normalizeMailMatchText } =
  await import('../../../lib/services/mail/mailListingMatcher.js');

const LISTINGS = [
  {
    id: 'is24',
    provider: 'immoscout',
    title: 'Helle 3-Zimmer-Wohnung mit Balkon im Altbau',
    link: 'https://www.immobilienscout24.de/expose/123456789',
    address: 'Goethestraße 18, 10625 Berlin',
  },
  {
    id: 'wg',
    provider: 'wgGesucht',
    title: 'WG-Zimmer',
    link: 'https://www.wg-gesucht.de/wohnungen-in-Berlin.9876543.html',
    address: 'Kantstraße 10, 10623 Berlin',
  },
];

/**
 * Run the matcher over a fixed list of messages, the way the storage would hand them out.
 *
 * @param {Object[]} messages
 * @param {Object} [options]
 */
async function match(messages, { listings = LISTINGS, anchors = [], assign = vi.fn(() => true), pageSize } = {}) {
  let served = false;
  const getMessages = vi.fn(() => {
    if (served) return [];
    served = true;
    return messages;
  });
  const result = await matchUnmatchedMailMessages('u1', { listings, anchors, assign, getMessages, pageSize });
  return { result, assign };
}

describe('normalisation', () => {
  it('folds German text into plain words', () => {
    expect(normalizeMailMatchText('Grüße aus der Goethestraße!')).toBe('grusse aus der goethestrasse');
  });

  it('reads ids out of portal links, but never a postcode or a word', () => {
    expect(extractListingCodes('https://www.immobilienscout24.de/expose/123456789')).toEqual(['123456789']);
    expect(extractListingCodes('https://example.com/wohnung/10115/berlin')).toEqual([]);
    expect(extractListingCodes('https://example.com/search?object_id=AB-12345')).toEqual(['ab12345']);
  });

  it('requires a house number for an address, and folds the usual spellings', () => {
    expect(extractAddressVariants('Goethestraße 18 a, 10625 Berlin')).toEqual([
      'goethe str 18a 10625 berlin',
      'goethe str 18a',
    ]);
    expect(extractAddressVariants('10625 Berlin')).toEqual([]);
    expect(extractAddressVariants('Berlin Mitte')).toEqual([]);
  });
});

describe('matchUnmatchedMailMessages', () => {
  it('links by the code in the portal link, ahead of an address elsewhere in the text', async () => {
    const { result, assign } = await match([
      { id: 'm1', subject: 'Ihre Anfrage 123456789', textBody: 'Unser Büro ist in der Kantstraße 10, 10623 Berlin.' },
    ]);

    expect(assign).toHaveBeenCalledWith({
      userId: 'u1',
      messageId: 'm1',
      listingId: 'is24',
      method: 'listing_code',
      confidence: 100,
    });
    expect(result).toEqual({ processed: 1, matched: 1, ambiguous: 0 });
  });

  it('reads a labelled reference number with separators in it', async () => {
    const { assign } = await match([
      { id: 'm1', subject: 'Neue Nachricht', textBody: 'Betrifft Objektnummer: 123 456 789. Viele Grüße' },
    ]);

    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'is24', method: 'listing_code' }));
  });

  it('links by street and house number when no code is given', async () => {
    const { assign } = await match([
      { id: 'm1', subject: 'Besichtigung', textBody: 'Treffpunkt ist die Kantstr. 10 vor dem Haus.' },
    ]);

    expect(assign).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm1', listingId: 'wg', method: 'address', confidence: 85 }),
    );
  });

  it('does not link on a street name alone or on a city', async () => {
    const { result, assign } = await match([
      { id: 'm1', subject: 'Wohnungen in Berlin', textBody: 'Neue Angebote rund um die Goethestraße in 10625 Berlin.' },
    ]);

    expect(assign).not.toHaveBeenCalled();
    expect(result.matched).toBe(0);
  });

  it('leaves a message that fits two listings equally for the user', async () => {
    const twins = [
      { ...LISTINGS[0], id: 'a', title: null, provider: null, link: null, address: 'Lindenallee 4, 12345 Ort' },
      { ...LISTINGS[0], id: 'b', title: null, provider: null, link: null, address: 'Lindenallee 4, 12345 Ort' },
    ];
    const { result, assign } = await match([{ id: 'm1', subject: 'Lindenallee 4' }], { listings: twins });

    expect(assign).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, matched: 0, ambiguous: 1 });
  });

  it('settles a tie on the portal the mail came from', async () => {
    const twins = [
      {
        id: 'a',
        provider: 'immoscout',
        title: null,
        link: 'https://www.immobilienscout24.de/expose/1111111',
        address: 'Lindenallee 4, 12345 Ort',
      },
      {
        id: 'b',
        provider: 'immowelt',
        title: null,
        link: 'https://www.immowelt.de/expose/2abc3de',
        address: 'Lindenallee 4, 12345 Ort',
      },
    ];
    const { assign } = await match([{ id: 'm1', subject: 'Lindenallee 4', senderAddress: 'noreply@immowelt.de' }], {
      listings: twins,
    });

    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'b', method: 'address' }));
  });

  it('follows a reply to a message that is already linked', async () => {
    const { assign } = await match(
      [{ id: 'm2', subject: 'Re: Termin', textBody: 'Passt, bis Montag.', inReplyTo: '<FIRST@landlord.example>' }],
      { anchors: [{ messageId: '<first@landlord.example>', listingId: 'wg' }] },
    );

    expect(assign).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'm2', listingId: 'wg', method: 'thread', confidence: 95 }),
    );
  });

  it('follows a reply even when the mailbox returned it before the message it answers', async () => {
    const { result, assign } = await match([
      { id: 'reply', subject: 'Re: Ihre Anfrage', references: ['<root@landlord.example>'] },
      { id: 'root', messageId: '<root@landlord.example>', subject: 'Ihre Anfrage 123456789' },
    ]);

    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'root', listingId: 'is24' }));
    expect(assign).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'reply', listingId: 'is24', method: 'thread' }),
    );
    expect(result.matched).toBe(2);
  });

  it('does not guess when a reply in one listing thread names another listing', async () => {
    const { result, assign } = await match(
      [{ id: 'm2', subject: 'Re: Anfrage 123456789', inReplyTo: '<first@landlord.example>' }],
      { anchors: [{ messageId: '<first@landlord.example>', listingId: 'wg' }] },
    );

    expect(assign).not.toHaveBeenCalled();
    expect(result.ambiguous).toBe(1);
  });

  it('ignores anchors that point at listings the user does not own', async () => {
    const { assign } = await match([{ id: 'm2', subject: 'Re: Termin', inReplyTo: '<first@x.example>' }], {
      anchors: [{ messageId: '<first@x.example>', listingId: 'somebody-elses' }],
    });

    expect(assign).not.toHaveBeenCalled();
  });

  it('pages through the unmatched messages with a cursor', async () => {
    const pages = [
      [{ id: 'm3', subject: 'Anfrage 123456789', sortAt: 3 }],
      [{ id: 'm2', subject: 'Kantstraße 10', sortAt: 2 }],
      [],
    ];
    const getMessages = vi.fn(() => pages.shift());
    const assign = vi.fn(() => true);

    const result = await matchUnmatchedMailMessages('u1', {
      listings: LISTINGS,
      anchors: [],
      assign,
      getMessages,
      pageSize: 1,
    });

    expect(getMessages).toHaveBeenNthCalledWith(2, 'u1', 1, { sortAt: 3, id: 'm3' });
    expect(result).toEqual({ processed: 2, matched: 2, ambiguous: 0 });
  });

  it('does nothing without listings', async () => {
    const getMessages = vi.fn();

    const result = await matchUnmatchedMailMessages('u1', { listings: [], anchors: [], getMessages });

    expect(getMessages).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, matched: 0, ambiguous: 0 });
  });
});
