/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';
import { IconMapPin } from '@douyinfe/semi-icons';

import AddressEditor from './AddressEditor.jsx';
import StatusControl from '../../../components/listings/StatusControl.jsx';
import * as timeService from '../../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';
import './ListingTitleBlock.less';

const { Text } = Typography;

/**
 * Who this listing is: its headline, where it is, and where the reader has got to with it.
 *
 * The status control used to sit in the row of buttons, among delete and open. It is not a command
 * though - it is the state of the reader's own process - so it belongs to the listing's identity,
 * next to the address rather than next to the actions.
 *
 * It is the dropdown the tables use. Four states used to fit across a desktop column as a segmented
 * control; the stages of an application - documents, viewing, the outcome - are eight, and a
 * segment that wraps to two lines is worse than a closed menu.
 *
 * @param {Object} props
 * @param {Object} props.listing
 * @param {boolean} props.wide - Whether there is room to caption the control.
 * @param {(position: {address: string, latitude: number, longitude: number}) => Promise<void>} props.onSaveAddress
 * @param {(address: string) => void} props.onPickOnMap
 * @param {(next: string|null) => void} props.onStatusChange
 * @returns {React.ReactElement}
 */
export default function ListingTitleBlock({ listing, wide, onSaveAddress, onPickOnMap, onStatusChange }) {
  const t = useTranslation();
  const locale = useLocale();
  const status = listing?.status?.status ?? null;
  const setAt = listing?.status?.setAt;
  const appointmentAt = listing?.status?.appointmentAt;

  return (
    <header className="listing-title">
      <h1 className="listing-title__heading">{listing?.title || t('listing.detail.defaultTitle')}</h1>

      <div className="listing-title__row">
        <div className="listing-title__address">
          <IconMapPin className="listing-title__pin" />
          {listing?.address ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(listing.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="listing-title__address-link"
            >
              {listing.address}
            </a>
          ) : (
            <Text type="secondary">{t('listing.detail.noAddress')}</Text>
          )}
          <AddressEditor isManual={listing?.address_is_manual === 1} onSave={onSaveAddress} onPickOnMap={onPickOnMap} />
        </div>

        <div className="listing-title__status">
          {wide && <span className="listing-title__status-caption">{t('listings.status.statusLabel')}</span>}
          <StatusControl status={status} onChange={onStatusChange} />
          {setAt && (
            <Text size="small" type="tertiary" className="listing-title__status-set">
              {t('listing.detail.statusSetAt', { date: timeService.format(setAt, true, locale) })}
            </Text>
          )}
          {appointmentAt && (
            <Text size="small" type="tertiary" className="listing-title__status-set">
              {t('listing.detail.viewingAt', { date: timeService.format(appointmentAt, true, locale) })}
            </Text>
          )}
        </div>
      </div>
    </header>
  );
}

ListingTitleBlock.displayName = 'ListingTitleBlock';
