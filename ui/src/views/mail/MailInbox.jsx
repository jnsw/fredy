/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Select, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconLink, IconMailStroked, IconRefresh, IconSetting, IconUnlink } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import MailMessageCard from './MailMessageCard.jsx';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { format } from '../../services/time/timeService';
import { errorMessage } from '../../services/xhr.js';
import {
  getMailAccount,
  getMailMessages,
  linkMailMessage,
  matchMail,
  searchMailListings,
  syncMail,
  unlinkMailMessage,
} from '../../services/mailClient.js';

import './MailInbox.less';

const { Text } = Typography;

/** How many messages the inbox shows. The rest stays in the database until its retention ends. */
const INBOX_LIMIT = 200;

/**
 * A one-line description of a listing for the picker: title, then address, then portal.
 *
 * @param {{title?: string|null, address?: string|null, provider?: string|null}} listing
 * @returns {string}
 */
function describeListing(listing) {
  return [listing.title, listing.address, listing.provider].filter(Boolean).join(' · ');
}

/**
 * The tag saying how a message was linked, so a guess by Fredy reads differently from a decision
 * the user made.
 *
 * @param {Object} props
 * @param {{method: string}} props.match
 * @returns {React.ReactElement}
 */
export function MatchMethodTag({ match }) {
  const t = useTranslation();
  return (
    <Tag size="small" color={match.method === 'manual' ? 'blue' : 'green'}>
      {t(`mail.matchMethod.${match.method}`)}
    </Tag>
  );
}

MatchMethodTag.displayName = 'MatchMethodTag';

/**
 * The messages Fredy downloaded from the user's own mailbox, and which listing each is about.
 *
 * The connection itself is configured under Settings > Mailbox. Here the user reads what arrived,
 * fetches now instead of waiting for the next run, and fixes or makes the links Fredy could not
 * make with confidence on its own.
 *
 * @returns {React.ReactElement}
 */
export default function MailInbox() {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [listings, setListings] = useState([]);
  const [picked, setPicked] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [storedAccount, storedMessages, ownListings] = await Promise.all([
        getMailAccount(),
        getMailMessages(INBOX_LIMIT),
        searchMailListings(''),
      ]);
      setAccount(storedAccount);
      setMessages(storedMessages);
      setListings(ownListings);
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Run one action with its own spinner, then reload what it may have changed.
   *
   * @param {string} name
   * @param {() => Promise<any>} action
   * @param {(result: any) => string} success - The toast for a result.
   * @param {string} failureKey
   * @returns {Promise<void>}
   */
  const run = async (name, action, success, failureKey) => {
    setBusy(name);
    try {
      Toast.success(success(await action()));
    } catch (error) {
      Toast.error(errorMessage(error, t(failureKey)));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const handleSync = () =>
    run(
      'sync',
      syncMail,
      (result) => t('mail.synced', { count: result?.stored ?? 0, matched: result?.matched ?? 0 }),
      'mail.syncError',
    );

  const handleMatch = () =>
    run('match', matchMail, (result) => t('mail.matched', { count: result?.matched ?? 0 }), 'mail.actionError');

  const handleLink = (messageId) => {
    const listingId = picked[messageId];
    if (!listingId) return;
    run(
      `link:${messageId}`,
      () => linkMailMessage(messageId, listingId),
      () => t('mail.linked'),
      'mail.actionError',
    );
  };

  const handleUnlink = (messageId) =>
    run(
      `unlink:${messageId}`,
      () => unlinkMailMessage(messageId),
      () => t('mail.unlinked'),
      'mail.actionError',
    );

  const searchListings = async (query) => {
    try {
      setListings(await searchMailListings(query));
    } catch {
      // The picker keeps the options it had.
    }
  };

  const openSettings = () => navigate('/settings/mailbox');

  const subtitle =
    account == null
      ? t('mail.subtitleNoAccount')
      : account.lastSyncAt
        ? t('mail.subtitleLastSync', { date: format(account.lastSyncAt, true, locale) })
        : t('mail.subtitle');

  return (
    <div className="mailInbox">
      <Headline
        text={t('mail.title')}
        subtitle={subtitle}
        actions={
          <Space wrap>
            <Button icon={<IconSetting />} theme="borderless" onClick={openSettings}>
              {t('mail.settings')}
            </Button>
            {account != null && (
              <Button icon={<IconLink />} loading={busy === 'match'} onClick={handleMatch}>
                {t('mail.matchNow')}
              </Button>
            )}
            {account != null && (
              <Button
                icon={<IconRefresh />}
                theme="solid"
                type="primary"
                loading={busy === 'sync'}
                disabled={!account.enabled}
                onClick={handleSync}
              >
                {t('mail.sync')}
              </Button>
            )}
          </Space>
        }
      />

      {account?.lastSyncError && (
        <Text type="danger" className="mailInbox__error">
          {t('mail.lastError', { error: account.lastSyncError })}
        </Text>
      )}

      {loading ? (
        <div className="mailInbox__loading">
          <Spin size="large" />
        </div>
      ) : messages.length === 0 ? (
        <Empty
          image={<IconMailStroked size="extra-large" />}
          title={account == null ? t('mail.emptyNoAccountTitle') : t('mail.emptyTitle')}
          description={account == null ? t('mail.emptyNoAccount') : t('mail.empty')}
        >
          {account == null && (
            <Button theme="solid" type="primary" onClick={openSettings}>
              {t('mail.configure')}
            </Button>
          )}
        </Empty>
      ) : (
        <div className="mailInbox__list">
          {messages.map((message) => (
            <MailMessageCard
              key={message.id}
              message={message}
              badge={
                message.match ? (
                  <MatchMethodTag match={message.match} />
                ) : (
                  <Tag size="small">{t('mail.unlinkedTag')}</Tag>
                )
              }
            >
              {message.match ? (
                <div className="mailMessage__link">
                  <Text type="tertiary" size="small">
                    {t('mail.linkedTo')}
                  </Text>
                  <Button
                    theme="borderless"
                    size="small"
                    onClick={() => navigate(`/listings/listing/${message.match.listingId}`)}
                  >
                    {describeListing(message.match.listing ?? {}) || t('mail.untitledListing')}
                  </Button>
                  <Button
                    theme="borderless"
                    type="tertiary"
                    size="small"
                    icon={<IconUnlink />}
                    loading={busy === `unlink:${message.id}`}
                    onClick={() => handleUnlink(message.id)}
                  >
                    {t('mail.unlink')}
                  </Button>
                </div>
              ) : (
                <div className="mailMessage__link">
                  <Select
                    className="mailMessage__picker"
                    filter
                    remote
                    showClear
                    value={picked[message.id]}
                    placeholder={t('mail.pickListing')}
                    emptyContent={t('mail.noListings')}
                    onSearch={searchListings}
                    onChange={(value) => setPicked((previous) => ({ ...previous, [message.id]: value }))}
                    optionList={listings.map((listing) => ({
                      value: listing.id,
                      label: describeListing(listing) || t('mail.untitledListing'),
                    }))}
                  />
                  <Button
                    icon={<IconLink />}
                    disabled={!picked[message.id]}
                    loading={busy === `link:${message.id}`}
                    onClick={() => handleLink(message.id)}
                  >
                    {t('mail.link')}
                  </Button>
                </div>
              )}
            </MailMessageCard>
          ))}
        </div>
      )}
    </div>
  );
}

MailInbox.displayName = 'MailInbox';
