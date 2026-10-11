/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Typography } from '@douyinfe/semi-ui-19';

import AiVerdictBadge from '../../../components/listings/AiVerdictBadge.jsx';
import { aiVerdictOf } from '../../../services/listings/aiVerdict.js';
import * as timeService from '../../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';

import './AiVerdictCard.less';

const { Text } = Typography;

/**
 * The AI verdict on the detail page, with the reasoning spelled out.
 *
 * On the overview the reasoning hides in a tooltip, because twenty of them would bury the listings.
 * Here there is one listing and room to read why, so the sentences are on the card - next to who
 * rated it and when, since a verdict is only worth as much as the model behind it and the advert it
 * read back then.
 *
 * Renders nothing for a listing nobody has rated, unless `action` is given - then the card is the
 * place the user starts a rating from.
 *
 * @param {Object} props
 * @param {Object} props.listing A row as the listings API returns it.
 * @param {React.ReactNode} [props.action] A control to render under the verdict.
 * @returns {React.ReactElement|null}
 */
export default function AiVerdictCard({ listing, action = null }) {
  const t = useTranslation();
  const locale = useLocale();
  const verdict = aiVerdictOf(listing);

  if (verdict == null && action == null) {
    return null;
  }

  return (
    <section className="listing-card aiVerdictCard">
      <h2 className="listing-card__label">{t('listing.detail.aiVerdictTitle')}</h2>
      {verdict != null ? (
        <>
          <AiVerdictBadge listing={listing} />
          {listing.ai_verdict_reason && <p className="aiVerdictCard__reason">{listing.ai_verdict_reason}</p>}
          <Text type="tertiary" size="small" className="aiVerdictCard__meta">
            {[
              listing.ai_verdict_source ? t('listings.aiVerdictSource', { source: listing.ai_verdict_source }) : null,
              listing.ai_verdict_at != null ? timeService.format(listing.ai_verdict_at, false, locale) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </>
      ) : (
        <Text type="tertiary" size="small">
          {t('listing.detail.aiVerdictNone')}
        </Text>
      )}
      {action != null && <div className="aiVerdictCard__action">{action}</div>}
    </section>
  );
}

AiVerdictCard.displayName = 'AiVerdictCard';
