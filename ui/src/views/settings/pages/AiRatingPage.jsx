/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  RadioGroup,
  TextArea,
  Toast,
} from '@douyinfe/semi-ui-19';
import { IconAlertTriangle } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { errorMessage } from '../../../services/xhr';
import { useActions, useSelector, useIsLoading } from '../../../services/state/store';
import * as timeService from '../../../services/time/timeService.js';
import { useTranslation, useLocale } from '../../../services/i18n/i18n.jsx';
import './AiRatingPage.less';

/** The two providers, as the API names them. */
const ANTHROPIC = 'anthropic';
const OPENAI_COMPATIBLE = 'openai-compatible';

/**
 * The form as it starts from what is stored. The key field always starts empty: the key is never
 * sent back, and an empty field means "keep the stored one".
 *
 * @param {Object|null} settings
 * @param {Object|null} defaults
 * @returns {Object}
 */
const formFrom = (settings, defaults) => ({
  provider: settings?.provider ?? ANTHROPIC,
  apiKey: '',
  baseUrl: settings?.baseUrl ?? '',
  model: settings?.model ?? '',
  instructions: settings?.instructions ?? '',
  autoRate: settings?.autoRate === true,
  dailyLimit: settings?.dailyLimit ?? defaults?.dailyLimit ?? 50,
});

/**
 * Rating listings with the user's own AI key.
 *
 * The key is write-only from here on: the page learns that one is stored, never what it is, and the
 * field stays empty with a placeholder saying so. Leaving it empty keeps the stored key - unless the
 * provider or the server changed, where the server asks for it again rather than sending a key
 * entered for one destination to another.
 *
 * Nothing on this page costs anything until the user rates a listing or switches automatic rating
 * on, and it says so, because every rating is billed to their own account.
 *
 * @returns {React.ReactElement}
 */
export default function AiRatingPage() {
  const t = useTranslation();
  const locale = useLocale();
  const actions = useActions();
  const { settings, defaults, loaded } = useSelector((state) => state.aiRating);
  const saving = useIsLoading(actions.aiRating.saveSettings);

  const [form, setForm] = useState(() => formFrom(settings, defaults));

  useEffect(() => {
    actions.aiRating.getSettings();
  }, []);

  useEffect(() => {
    setForm(formFrom(settings, defaults));
  }, [settings, defaults]);

  const stored = useMemo(() => formFrom(settings, defaults), [settings, defaults]);
  const dirty =
    form.apiKey.trim().length > 0 ||
    ['provider', 'baseUrl', 'model', 'instructions', 'autoRate', 'dailyLimit'].some((key) => form[key] !== stored[key]);

  useUnsavedWarning(dirty);

  const set = (key) => (value) => setForm((previous) => ({ ...previous, [key]: value }));

  // The stored key only counts while it would go to the same place.
  const keyKept =
    settings?.hasApiKey === true &&
    settings.provider === form.provider &&
    (form.provider === ANTHROPIC || (settings.baseUrl ?? '') === form.baseUrl.trim().replace(/\/+$/, ''));

  const handleSave = async () => {
    try {
      await actions.aiRating.saveSettings({
        provider: form.provider,
        apiKey: form.apiKey,
        baseUrl: form.provider === OPENAI_COMPATIBLE ? form.baseUrl : null,
        model: form.model,
        instructions: form.instructions,
        autoRate: form.autoRate,
        dailyLimit: form.dailyLimit,
      });
      Toast.success(t('settings.userSettingsSaved'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  const handleRemove = async () => {
    try {
      await actions.aiRating.deleteSettings();
      Toast.success(t('settings.aiRating.removed'));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.userSettingsSaveError')));
    }
  };

  const paused = settings?.pausedUntil != null && settings.pausedUntil > Date.now();
  const pausedUntilSaved = paused && settings.pausedUntil >= (defaults?.pausedUntilSaved ?? Number.MAX_SAFE_INTEGER);

  return (
    <div className="settingsShell__page aiRatingPage">
      <p className="settingsShell__pageIntro">{t('settings.aiRating.intro')}</p>

      <SegmentPart name={t('settings.aiRating.providerTitle')} helpText={t('settings.aiRating.providerHelp')}>
        <RadioGroup type="button" value={form.provider} onChange={(e) => set('provider')(e.target.value)}>
          <Radio value={ANTHROPIC}>{t('settings.aiRating.providerAnthropic')}</Radio>
          <Radio value={OPENAI_COMPATIBLE}>{t('settings.aiRating.providerOpenAi')}</Radio>
        </RadioGroup>

        <div className="aiRatingPage__field">
          <label className="settingsShell__subSetting__label" htmlFor="aiRatingApiKey">
            {t('settings.aiRating.apiKey')}
          </label>
          <Input
            id="aiRatingApiKey"
            mode="password"
            autoComplete="off"
            value={form.apiKey}
            onChange={set('apiKey')}
            placeholder={keyKept ? t('settings.aiRating.apiKeyStored') : t('settings.aiRating.apiKeyPlaceholder')}
          />
          <p className="settingsShell__inlineHint">{t('settings.aiRating.apiKeyHelp')}</p>
        </div>

        {form.provider === OPENAI_COMPATIBLE && (
          <div className="aiRatingPage__field">
            <label className="settingsShell__subSetting__label" htmlFor="aiRatingBaseUrl">
              {t('settings.aiRating.baseUrl')}
            </label>
            <Input
              id="aiRatingBaseUrl"
              value={form.baseUrl}
              onChange={set('baseUrl')}
              placeholder="https://api.openai.com/v1"
            />
            <p className="settingsShell__inlineHint">{t('settings.aiRating.baseUrlHelp')}</p>
          </div>
        )}

        <div className="aiRatingPage__field">
          <label className="settingsShell__subSetting__label" htmlFor="aiRatingModel">
            {t('settings.aiRating.model')}
          </label>
          <Input
            id="aiRatingModel"
            value={form.model}
            onChange={set('model')}
            placeholder={
              form.provider === ANTHROPIC
                ? (defaults?.anthropicModel ?? 'claude-opus-5-5')
                : t('settings.aiRating.modelPlaceholderOpenAi')
            }
          />
          <p className="settingsShell__inlineHint">
            {form.provider === ANTHROPIC
              ? t('settings.aiRating.modelHelpAnthropic', { model: defaults?.anthropicModel ?? 'claude-opus-5-5' })
              : t('settings.aiRating.modelHelpOpenAi')}
          </p>
        </div>
      </SegmentPart>

      <SegmentPart name={t('settings.aiRating.autoTitle')} helpText={t('settings.aiRating.autoHelp')}>
        <Checkbox checked={form.autoRate} onChange={(e) => set('autoRate')(e.target.checked)}>
          {t('settings.aiRating.autoEnable')}
        </Checkbox>
        <div className={`settingsShell__subSettings${form.autoRate ? '' : ' settingsShell__subSettings--disabled'}`}>
          <div className="settingsShell__subSetting">
            <span className="settingsShell__subSetting__label">{t('settings.aiRating.dailyLimit')}</span>
            <p className="settingsShell__subSetting__help">{t('settings.aiRating.dailyLimitHelp')}</p>
            <InputNumber
              min={1}
              max={1000}
              precision={0}
              disabled={!form.autoRate}
              value={form.dailyLimit}
              onChange={(value) => set('dailyLimit')(Number.isFinite(value) ? value : stored.dailyLimit)}
              style={{ width: 160 }}
            />
          </div>
        </div>
        {paused && (
          <p className="settingsShell__helpWarning">
            <IconAlertTriangle size="small" />
            <span>
              {pausedUntilSaved
                ? t('settings.aiRating.pausedUntilSaved', { error: settings.lastError ?? '' })
                : t('settings.aiRating.pausedUntil', {
                    until: timeService.format(settings.pausedUntil, false, locale),
                    error: settings.lastError ?? '',
                  })}
            </span>
          </p>
        )}
      </SegmentPart>

      <SegmentPart name={t('settings.aiRating.criteriaTitle')} helpText={t('settings.aiRating.criteriaHelp')}>
        <TextArea
          value={form.instructions}
          onChange={set('instructions')}
          placeholder={defaults?.instructions ?? ''}
          autosize={{ minRows: 8, maxRows: 24 }}
          maxCount={10000}
        />
        <div className="aiRatingPage__criteriaActions">
          <Button
            size="small"
            theme="borderless"
            disabled={defaults?.instructions == null || form.instructions === defaults.instructions}
            onClick={() => set('instructions')(defaults.instructions)}
          >
            {t('settings.aiRating.criteriaStartFromDefault')}
          </Button>
        </div>
      </SegmentPart>

      {loaded && settings != null && (
        <div className="aiRatingPage__remove">
          <Popconfirm
            title={t('settings.aiRating.removeConfirmTitle')}
            content={t('settings.aiRating.removeConfirm')}
            onConfirm={handleRemove}
          >
            <Button type="danger" theme="borderless">
              {t('settings.aiRating.remove')}
            </Button>
          </Popconfirm>
        </div>
      )}

      <SettingsSaveBar dirty={dirty} saving={saving} onSave={handleSave} onDiscard={() => setForm(stored)} />
    </div>
  );
}

AiRatingPage.displayName = 'AiRatingPage';
