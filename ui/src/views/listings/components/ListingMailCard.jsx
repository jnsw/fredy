/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useState } from 'react';
import { Typography } from '@douyinfe/semi-ui-19';

import MailMessageCard from '../../mail/MailMessageCard.jsx';
import { MatchMethodTag } from '../../mail/MailInbox.jsx';
import { getListingMailMessages } from '../../../services/mailClient.js';
import { useTranslation } from '../../../services/i18n/i18n.jsx';

const { Text } = Typography;

/**
 * The mail linked to a listing, from the signed-in user's own mailbox.
 *
 * `configured` stays false for a user without a mailbox, and the page then leaves the section out
 * entirely - an empty "no mail" card on every listing would be noise for everyone who never
 * connected one.
 *
 * @param {string} listingId
 * @returns {{configured: boolean, messages: Object[]}}
 */
export function useListingMail(listingId) {
  const [state, setState] = useState({ configured: false, messages: [] });

  useEffect(() => {
    let cancelled = false;
    getListingMailMessages(listingId)
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => {
        if (!cancelled) setState({ configured: false, messages: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  return state;
}

/**
 * The replies about this listing, newest first.
 *
 * @param {Object} props
 * @param {Object[]} props.messages
 * @returns {React.ReactElement}
 */
export default function ListingMailCard({ messages }) {
  const t = useTranslation();

  return (
    <section className="listing-card">
      <h2 className="listing-card__label">{t('listing.detail.mailTitle')}</h2>
      {messages.length === 0 ? (
        <Text type="tertiary">{t('listing.detail.mailEmpty')}</Text>
      ) : (
        <div className="mailInbox__list">
          {messages.map((message) => (
            <MailMessageCard key={message.id} message={message} badge={<MatchMethodTag match={message.match} />} />
          ))}
        </div>
      )}
    </section>
  );
}

ListingMailCard.displayName = 'ListingMailCard';
