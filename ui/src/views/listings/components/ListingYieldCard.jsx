/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import React from 'react';
import { Button, InputNumber, Toast, Typography } from '@douyinfe/semi-ui-19';

import { buildYieldFacts } from '../listingFacts.js';
import { formatEuro } from '../../../components/cards/chartTheme.js';
import { useActions } from '../../../services/state/store.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './ListingYieldCard.less';

const { Text } = Typography;

/**
 * Upper bound of the input, matching `MAX_COLD_RENT_OVERRIDE` on the server, which refuses anything
 * above it. Here only so the field stops a typo before the request does.
 * @type {number}
 */
const MAX_COLD_RENT = 100000;

/**
 * What this purchase would earn if it were let, and the field to correct the rent it assumes.
 *
 * Purchases only; for a rental the card renders nothing, so that half of the page is unchanged.
 *
 * The yield is computed by the server and arrives on the listing as `rentalYield`. It starts from a
 * cold rent that is never the advert's own: either the median of the rentals Fredy found nearby, or
 * the figure the user entered below. The card says which, every time, and when there is neither it
 * says why rather than showing a yield built on nothing - and still offers the field, because the
 * user typing in the rent from the exposé is exactly how such a listing gets a yield.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as `GET /api/listings/:id` returns it.
 * @param {() => void} [props.onChange] Called after the rent is stored, so the page can re-read the
 *   listing and with it the recomputed yield.
 * @returns {React.ReactElement|null}
 */
export default function ListingYieldCard({ listing, onChange }) {
  const t = useTranslation();
  const locale = useLocale();
  const actions = useActions();
  const override = listing?.cold_rent_override ?? null;
  const [draft, setDraft] = React.useState(override);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDraft(override);
  }, [listing?.id, override]);

  if (listing?.dealType !== 'buy') {
    return null;
  }

  const view = buildYieldFacts(listing.rentalYield, { t, locale, formatEuro });

  /**
   * @param {number|null} coldRent EUR per month, or null to go back to the estimate.
   */
  const save = async (coldRent) => {
    setSaving(true);
    try {
      await actions.listingsData.setColdRentOverride(listing.id, coldRent);
      Toast.success(t(coldRent == null ? 'listing.detail.yieldOverrideCleared' : 'listing.detail.yieldOverrideSaved'));
      onChange?.();
    } catch {
      Toast.error(t('listing.detail.yieldOverrideError'));
    } finally {
      setSaving(false);
    }
  };

  const draftValue = draft == null || draft === '' ? null : Number(draft);
  const canSave =
    draftValue != null &&
    Number.isFinite(draftValue) &&
    draftValue > 0 &&
    draftValue <= MAX_COLD_RENT &&
    draftValue !== override;

  return (
    <section className="listing-card listingYield">
      <h2 className="listing-card__label">{t('listing.detail.yieldTitle')}</h2>

      {view == null ? (
        <Text type="tertiary" size="small" className="listingYield__empty">
          {t('listing.detail.yieldNoEstimate')}
        </Text>
      ) : (
        <>
          <dl className="listingYield__facts">
            {view.facts.map(({ id, label, value, emphasis, note }) => (
              <div className={`listingYield__fact${emphasis ? ' listingYield__fact--emphasis' : ''}`} key={id}>
                <dt className="listingYield__fact-label">{label}</dt>
                <dd className="listingYield__fact-value">{value}</dd>
                {note && <dd className="listingYield__fact-note">{note}</dd>}
              </div>
            ))}
          </dl>
          <Text type="tertiary" size="small" className="listingYield__source">
            {view.source}
          </Text>
        </>
      )}

      <div className="listingYield__override">
        <span className="listingYield__override-label">{t('listing.detail.yieldOverrideLabel')}</span>
        <div className="listingYield__override-row">
          <InputNumber
            className="listingYield__override-input"
            aria-label={t('listing.detail.yieldOverrideLabel')}
            placeholder={t('listing.detail.yieldOverridePlaceholder')}
            suffix={t('listing.detail.yieldOverrideSuffix')}
            min={1}
            max={MAX_COLD_RENT}
            hideButtons
            value={draft ?? ''}
            onChange={(value) => setDraft(value === '' ? null : value)}
          />
          <Button size="small" theme="solid" disabled={!canSave} loading={saving} onClick={() => save(draftValue)}>
            {t('listing.detail.yieldOverrideSave')}
          </Button>
          {override != null && (
            <Button size="small" theme="borderless" type="tertiary" loading={saving} onClick={() => save(null)}>
              {t('listing.detail.yieldOverrideClear')}
            </Button>
          )}
        </div>
      </div>

      {view != null && (
        <Text type="tertiary" size="small" className="listingYield__footnote">
          {view.footnote}
        </Text>
      )}
    </section>
  );
}

ListingYieldCard.displayName = 'ListingYieldCard';
