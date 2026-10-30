/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Empty, Radio, RadioGroup, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconCalendarClock, IconExternalOpen } from '@douyinfe/semi-icons';
import { useNavigate } from 'react-router';

import Headline from '../../components/headline/Headline.jsx';
import MailMessageCard from '../mail/MailMessageCard.jsx';
import { useListingMail } from '../listings/components/ListingMailCard.jsx';
import { statusLabel } from '../../components/listings/statusOptions.js';
import { useActions } from '../../services/state/store.js';
import { useLocale, useTranslation } from '../../services/i18n/i18n.jsx';
import { format } from '../../services/time/timeService';
import { errorMessage } from '../../services/xhr.js';
import { getViewings, setViewingAppointment } from '../../services/viewingsClient.js';
import no_image from '../../assets/no_image.png';

import './Viewings.less';

const { Text } = Typography;

/** The three views of the list. `upcoming` is what the page is for, so it opens there. */
const VIEWS = ['upcoming', 'visited', 'all'];

/**
 * The mail linked to one viewing, folded away. Only rendered for a user with a mailbox.
 *
 * @param {Object} props
 * @param {string} props.listingId
 * @returns {React.ReactElement|null}
 */
function ViewingMail({ listingId }) {
  const t = useTranslation();
  const { configured, messages } = useListingMail(listingId);
  if (!configured || messages.length === 0) return null;
  return (
    <details className="viewing__mail">
      <summary>{t('viewings.mail', { count: messages.length })}</summary>
      <div className="mailInbox__list">
        {messages.map((message) => (
          <MailMessageCard key={message.id} message={message} />
        ))}
      </div>
    </details>
  );
}

ViewingMail.displayName = 'ViewingMail';

/**
 * The viewings: listings the user is invited to view, soonest first, and the ones already seen.
 *
 * An invitation lands here from wherever it was set - the status control on any listing, or a
 * landlord's mail Fredy recognised - so the page has nothing of its own to store but the time.
 * Marking a viewing as visited moves it to the second tab and keeps its date.
 *
 * @returns {React.ReactElement}
 */
export default function Viewings() {
  const t = useTranslation();
  const locale = useLocale();
  const navigate = useNavigate();
  const actions = useActions();
  const [viewings, setViewings] = useState([]);
  const [view, setView] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setViewings(await getViewings());
    } catch (error) {
      Toast.error(errorMessage(error, t('viewings.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * @param {string} name
   * @param {() => Promise<void>} action
   * @param {string} successKey
   * @returns {Promise<void>}
   */
  const run = async (name, action, successKey) => {
    setBusy(name);
    try {
      await action();
      Toast.success(t(successKey));
    } catch (error) {
      Toast.error(errorMessage(error, t('viewings.saveError')));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const saveAppointment = (listingId, date) =>
    run(
      `appointment:${listingId}`,
      () => setViewingAppointment(listingId, date == null ? null : new Date(date).getTime()),
      'viewings.appointmentSaved',
    );

  const setStatus = (listingId, status) =>
    run(
      `status:${listingId}`,
      () => actions.listingsData.setListingStatus(listingId, status),
      status === 'visited' ? 'viewings.markedVisited' : 'viewings.restored',
    );

  const counts = {
    upcoming: viewings.filter((viewing) => viewing.status?.status === 'invited').length,
    visited: viewings.filter((viewing) => viewing.status?.status === 'visited').length,
    all: viewings.length,
  };
  const shown = viewings.filter(
    (viewing) => view === 'all' || viewing.status?.status === (view === 'upcoming' ? 'invited' : 'visited'),
  );

  return (
    <div className="viewings">
      <Headline text={t('viewings.title')} subtitle={t('viewings.subtitle')} />

      <RadioGroup type="button" value={view} onChange={(event) => setView(event.target.value)}>
        {VIEWS.map((key) => (
          <Radio key={key} value={key}>
            {t(`viewings.view.${key}`, { count: counts[key] })}
          </Radio>
        ))}
      </RadioGroup>

      {loading ? (
        <div className="viewings__loading">
          <Spin size="large" />
        </div>
      ) : shown.length === 0 ? (
        <Empty
          image={<IconCalendarClock size="extra-large" />}
          title={t('viewings.emptyTitle')}
          description={t(view === 'visited' ? 'viewings.emptyVisited' : 'viewings.empty')}
        />
      ) : (
        <div className="viewings__list">
          {shown.map((viewing) => {
            const invited = viewing.status?.status === 'invited';
            const past = viewing.appointmentAt != null && viewing.appointmentAt < Date.now();
            return (
              <article key={viewing.id} className="viewing">
                <img className="viewing__image" src={viewing.imageUrl || no_image} alt="" loading="lazy" />
                <div className="viewing__body">
                  <div className="viewing__head">
                    <div className="viewing__identity">
                      <Text strong className="viewing__title">
                        {viewing.title || t('mail.untitledListing')}
                      </Text>
                      <Text type="tertiary" size="small">
                        {[viewing.address, viewing.provider].filter(Boolean).join(' · ')}
                      </Text>
                    </div>
                    <span className="viewing__badges">
                      <Tag size="small" color={invited ? 'purple' : 'green'}>
                        {statusLabel(t, viewing.status?.status)}
                      </Tag>
                      {invited && past && (
                        <Tag size="small" color="orange">
                          {t('viewings.past')}
                        </Tag>
                      )}
                    </span>
                  </div>

                  <div className="viewing__appointment">
                    <span className="viewing__label">{t('viewings.appointment')}</span>
                    <DatePicker
                      type="dateTime"
                      format="yyyy-MM-dd HH:mm"
                      needConfirm
                      value={viewing.appointmentAt ?? undefined}
                      placeholder={t('viewings.appointmentPlaceholder')}
                      disabled={busy === `appointment:${viewing.id}`}
                      onConfirm={(date) => saveAppointment(viewing.id, date)}
                      onClear={() => saveAppointment(viewing.id, null)}
                    />
                    {viewing.appointmentAt != null && (
                      <Text type="tertiary" size="small">
                        {format(viewing.appointmentAt, true, locale)}
                      </Text>
                    )}
                  </div>

                  <div className="viewing__actions">
                    {invited ? (
                      <Button
                        theme="solid"
                        type="primary"
                        loading={busy === `status:${viewing.id}`}
                        onClick={() => setStatus(viewing.id, 'visited')}
                      >
                        {t('viewings.markVisited')}
                      </Button>
                    ) : (
                      <Button
                        loading={busy === `status:${viewing.id}`}
                        onClick={() => setStatus(viewing.id, 'invited')}
                      >
                        {t('viewings.restore')}
                      </Button>
                    )}
                    <Button theme="borderless" onClick={() => navigate(`/listings/listing/${viewing.id}`)}>
                      {t('viewings.openListing')}
                    </Button>
                    {viewing.link && (
                      <a className="viewing__external" href={viewing.link} target="_blank" rel="noopener noreferrer">
                        <IconExternalOpen size="small" /> {t('viewings.openAd')}
                      </a>
                    )}
                  </div>

                  <ViewingMail listingId={viewing.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

Viewings.displayName = 'Viewings';
