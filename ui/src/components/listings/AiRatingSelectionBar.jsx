/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { Button, Progress } from '@douyinfe/semi-ui-19';
import { IconAIStrokedLevel1 } from '@douyinfe/semi-icons';

import { useTranslation } from '../../services/i18n/i18n.jsx';

import './AiRatingSelectionBar.less';

/**
 * The bar that rates the listings the user ticked, with their own AI key.
 *
 * Shows only once something is ticked: for a user with a key the checkboxes are always there, and a
 * permanent bar above them would be a row of disabled buttons most of the time. While a rating runs
 * it turns into a progress bar, because each listing is a model call of several seconds and a
 * selection of twenty takes a while.
 *
 * @param {Object} props
 * @param {number} props.count How many listings are ticked.
 * @param {{done: number, total: number}|null} props.progress Set while a rating runs.
 * @param {() => void} props.onRate
 * @param {() => void} props.onSelectPage Ticks every listing on the page.
 * @param {() => void} props.onClear
 * @returns {React.ReactElement|null}
 */
export default function AiRatingSelectionBar({ count, progress, onRate, onSelectPage, onClear }) {
  const t = useTranslation();

  if (count === 0 && progress == null) {
    return null;
  }

  if (progress != null) {
    return (
      <div className="aiRatingSelectionBar" role="status">
        <span className="aiRatingSelectionBar__text">
          {t('listings.aiRateProgress', { done: progress.done, total: progress.total })}
        </span>
        <Progress
          className="aiRatingSelectionBar__progress"
          percent={progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}
          aria-label={t('listings.aiRateProgress', { done: progress.done, total: progress.total })}
        />
      </div>
    );
  }

  return (
    <div className="aiRatingSelectionBar">
      <span className="aiRatingSelectionBar__text">{t('listings.aiRateSelected', { count })}</span>
      <div className="aiRatingSelectionBar__actions">
        <Button size="small" theme="borderless" onClick={onSelectPage}>
          {t('listings.aiRateSelectPage')}
        </Button>
        <Button size="small" theme="borderless" type="tertiary" onClick={onClear}>
          {t('listings.aiRateClearSelection')}
        </Button>
        <Button size="small" theme="solid" icon={<IconAIStrokedLevel1 />} onClick={onRate}>
          {t('listings.aiRateButton')}
        </Button>
      </div>
    </div>
  );
}

AiRatingSelectionBar.displayName = 'AiRatingSelectionBar';
