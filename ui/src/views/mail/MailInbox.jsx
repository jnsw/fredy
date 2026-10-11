/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconMailStroked, IconRefresh, IconSetting } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { format } from '../../services/time/timeService';
import { errorMessage } from '../../services/xhr.js';
import { getMailAccount, getMailMessages, syncMail } from '../../services/mailClient.js';

import './MailInbox.less';

const { Text } = Typography;

/** How many messages the inbox shows. The rest stays in the database until its retention ends. */
const INBOX_LIMIT = 200;

/**
 * One downloaded message.
 *
 * The body is plain text, put into the page as a text node. Mail is written by strangers, and
 * Fredy never stores or renders its HTML - the server converted it to text on download - so there
 * is no markup here that could run, load a tracking pixel or restyle the page.
 *
 * @param {Object} props
 * @param {Object} props.message
 * @param {React.ReactNode} [props.children] Rendered under the message, for what can be done with it.
 * @returns {React.ReactElement}
 */
export function MailMessageCard({ message, children = null }) {
  const t = useTranslation();
  const locale = useLocale();
  const when = message.receivedAt ?? message.createdAt;
  const sender = [message.senderName, message.senderAddress].filter(Boolean).join(' · ');

  return (
    <article className="mailMessage">
      <header className="mailMessage__header">
        <div className="mailMessage__identity">
          <Text strong className="mailMessage__subject">
            {message.unreadable ? t('mail.unreadable') : message.subject || t('mail.noSubject')}
          </Text>
          <Text type="tertiary" size="small">
            {[sender || t('mail.unknownSender'), when ? format(when, true, locale) : null].filter(Boolean).join(' · ')}
          </Text>
        </div>
        {message.truncated && <Tag size="small">{t('mail.truncated')}</Tag>}
      </header>
      {message.textBody && (
        <details className="mailMessage__body">
          <summary>{t('mail.showMessage')}</summary>
          <pre>{message.textBody}</pre>
        </details>
      )}
      {children}
    </article>
  );
}

MailMessageCard.displayName = 'MailMessageCard';

/**
 * The messages Fredy downloaded from the user's own mailbox.
 *
 * The connection itself is configured under Settings > Mailbox; this page only reads what arrived
 * and offers to fetch now instead of waiting for the next scheduled run.
 *
 * @returns {React.ReactElement}
 */
export default function MailInbox() {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [storedAccount, storedMessages] = await Promise.all([getMailAccount(), getMailMessages(INBOX_LIMIT)]);
      setAccount(storedAccount);
      setMessages(storedMessages);
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncMail();
      Toast.success(t('mail.synced', { count: result?.stored ?? 0 }));
    } catch (error) {
      Toast.error(errorMessage(error, t('mail.syncError')));
    } finally {
      setSyncing(false);
      load();
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
              <Button
                icon={<IconRefresh />}
                theme="solid"
                type="primary"
                loading={syncing}
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
            <MailMessageCard key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

MailInbox.displayName = 'MailInbox';
