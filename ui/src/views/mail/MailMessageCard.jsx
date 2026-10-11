/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tag, Typography } from '@douyinfe/semi-ui-19';

import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { format } from '../../services/time/timeService';

import './MailInbox.less';

const { Text } = Typography;

/**
 * One downloaded message, used by the inbox and by the listing page.
 *
 * The body is plain text, put into the page as a text node. Mail is written by strangers, and
 * Fredy never stores or renders its HTML - the server converted it to text on download - so there
 * is no markup here that could run, load a tracking pixel or restyle the page.
 *
 * @param {Object} props
 * @param {Object} props.message
 * @param {React.ReactNode} [props.badge] Shown at the right of the header, e.g. how it was linked.
 * @param {React.ReactNode} [props.children] Rendered under the message, for what can be done with it.
 * @returns {React.ReactElement}
 */
export default function MailMessageCard({ message, badge = null, children = null }) {
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
        <span className="mailMessage__badges">
          {message.truncated && <Tag size="small">{t('mail.truncated')}</Tag>}
          {badge}
        </span>
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
