/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Tooltip } from '@douyinfe/semi-ui-19';

import { aiVerdictOf } from '../../services/listings/aiVerdict.js';
import { useTranslation } from '../../services/i18n/i18n.jsx';

import './AiVerdictBadge.less';

/**
 * An AI's verdict on a listing - GOOD, MAYBE or BAD - as a chip, with the reasoning one hover away.
 *
 * The chip says "AI" in its own text. A bare "Good" next to the price would read as Fredy's opinion,
 * or as a fact about the flat, when it is one model's reading of one advert. The reasoning is in the
 * tooltip rather than on the card because it is a sentence or three, and twenty of those would turn
 * the overview into a wall of text.
 *
 * Renders nothing for a listing nobody has rated, which is every listing for anybody not using the
 * feature.
 *
 * @param {Object} props
 * @param {Object|null} props.listing A row as the listings API returns it.
 * @returns {React.ReactElement|null}
 */
export default function AiVerdictBadge({ listing }) {
  const t = useTranslation();
  const verdict = aiVerdictOf(listing);

  if (verdict == null) {
    return null;
  }

  const reason = listing.ai_verdict_reason;
  const tooltip = (
    <span className="aiVerdictBadge__why">
      {reason ? <span>{reason}</span> : <span>{t('listings.aiVerdictNoReason')}</span>}
      {listing.ai_verdict_source && (
        <span className="aiVerdictBadge__source">
          {t('listings.aiVerdictSource', { source: listing.ai_verdict_source })}
        </span>
      )}
    </span>
  );

  return (
    <Tooltip content={tooltip} position="top">
      <span className={`aiVerdictBadge aiVerdictBadge--${verdict}`}>{t(`listings.aiVerdict.${verdict}`)}</span>
    </Tooltip>
  );
}

AiVerdictBadge.displayName = 'AiVerdictBadge';
