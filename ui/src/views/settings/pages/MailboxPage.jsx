/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Select, Switch, Toast, Typography } from '@douyinfe/semi-ui-19';
import { IconDelete, IconMail } from '@douyinfe/semi-icons';

import { SegmentPart } from '../../../components/segment/SegmentPart';
import SettingsSaveBar from '../../../components/settingsShell/SettingsSaveBar.jsx';
import { useUnsavedWarning } from '../../../hooks/useUnsavedWarning.js';
import { errorMessage } from '../../../services/xhr';
import { useLocale, useTranslation } from '../../../services/i18n/i18n.jsx';
import { format } from '../../../services/time/timeService';
import {
  deleteAllMailMessages,
  deleteMailAccount,
  getMailAccount,
  saveMailAccount,
  testMailAccount,
} from '../../../services/mailClient.js';
import './MailboxPage.less';

const { Text } = Typography;

/** What the form shows before anything is stored. */
const EMPTY_FORM = {
  host: '',
  port: 993,
  username: '',
  password: '',
  mailbox: 'INBOX',
  enabled: true,
  retentionDays: 90,
};

/** The fields that decide which mailbox this is. Changing one of them needs the password again. */
const IDENTITY_FIELDS = ['host', 'port', 'username'];

/** Must match MAIL_RETENTION_OPTIONS in `lib/services/storage/mailStorage.js`. */
const RETENTION_OPTIONS = [30, 90, 180, 365];

/**
 * The form state for a stored account, with the password left empty: it is never sent back, and an
 * empty field is how "keep the stored one" is said.
 *
 * @param {Object|null} account
 * @returns {Object}
 */
function toForm(account) {
  if (account == null) return EMPTY_FORM;
  return {
    host: account.host,
    port: account.port,
    username: account.username,
    password: '',
    mailbox: account.mailbox,
    enabled: account.enabled,
    retentionDays: account.retentionDays,
  };
}

/**
 * The user's own IMAP mailbox: where Fredy reads replies to applications from.
 *
 * Saving goes through the page's save bar like every other settings page. Testing the connection,
 * fetching mail and the two deletions act on what is stored, so they are buttons of their own and
 * are only offered once there is something stored.
 *
 * @returns {React.ReactElement}
 */
export default function MailboxPage() {
  const t = useTranslation();
  const locale = useLocale();
  const [account, setAccount] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const stored = await getMailAccount();
      setAccount(stored);
      setForm(toForm(stored));
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.mailbox.loadError')));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const stored = useMemo(() => toForm(account), [account]);
  const dirty = loaded && Object.keys(EMPTY_FORM).some((key) => form[key] !== stored[key]);
  const identityChanged = account != null && IDENTITY_FIELDS.some((key) => form[key] !== stored[key]);
  const needsPassword = (account == null || identityChanged) && form.password.length === 0;

  useUnsavedWarning(dirty);

  const field = (name) => (value) => setForm((previous) => ({ ...previous, [name]: value }));

  /**
   * Run one of the buttons, with its own spinner and a toast either way.
   *
   * @param {string} name
   * @param {() => Promise<any>} action
   * @param {string} successKey
   * @returns {Promise<boolean>}
   */
  const run = async (name, action, successKey) => {
    setBusy(name);
    try {
      await action();
      Toast.success(t(successKey));
      return true;
    } catch (error) {
      Toast.error(errorMessage(error, t('settings.mailbox.actionError')));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const handleSave = async () => {
    if (needsPassword) {
      Toast.warning(t('settings.mailbox.passwordRequired'));
      return;
    }
    setBusy('save');
    try {
      const saved = await saveMailAccount({
        host: form.host.trim(),
        port: form.port,
        username: form.username.trim(),
        mailbox: form.mailbox.trim() || 'INBOX',
        enabled: form.enabled,
        retentionDays: form.retentionDays,
        ...(form.password.length > 0 ? { password: form.password } : {}),
      });
      setAccount(saved);
      setForm(toForm(saved));
      Toast.success(t('settings.mailbox.saved'));
    } catch (error) {
      Toast.error(
        error?.json?.code === 'PASSWORD_REQUIRED'
          ? t('settings.mailbox.passwordRequired')
          : errorMessage(error, t('settings.mailbox.actionError')),
      );
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (await run('delete', deleteMailAccount, 'settings.mailbox.deleted')) {
      setAccount(null);
      setForm(EMPTY_FORM);
    }
  };

  const handleTest = async () => {
    await run('test', testMailAccount, 'settings.mailbox.connectionOk');
    // A failed test does not touch the stored error, but a sync that ran meanwhile might have.
    load();
  };

  const portOptions = [
    { value: 993, label: t('settings.mailbox.port993') },
    { value: 143, label: t('settings.mailbox.port143') },
  ];

  const retentionOptions = RETENTION_OPTIONS.map((days) => ({
    value: days,
    label: t('settings.mailbox.retentionOption', { days }),
  }));

  return (
    <div className="settingsShell__page mailboxPage">
      <p className="settingsShell__pageIntro">{t('settings.mailbox.pageIntro')}</p>

      <SegmentPart name={t('settings.mailbox.account')} helpText={t('settings.mailbox.accountHelp')}>
        <div className="mailboxPage__grid">
          <Input
            value={form.host}
            onChange={field('host')}
            prefix={t('settings.mailbox.host')}
            placeholder="imap.example.com"
            autoComplete="off"
          />
          <Select
            value={form.port}
            onChange={field('port')}
            optionList={portOptions}
            prefix={t('settings.mailbox.port')}
            style={{ width: '100%' }}
          />
          <Input
            value={form.username}
            onChange={field('username')}
            prefix={t('settings.mailbox.username')}
            placeholder="name@example.com"
            autoComplete="off"
          />
          {/* Masked, and empty even when a password is stored: it never comes back from the
              server, so there is nothing to show. Leaving it empty keeps the stored one. */}
          <Input
            mode="password"
            value={form.password}
            onChange={field('password')}
            prefix={t('settings.mailbox.password')}
            placeholder={
              account?.hasPassword && !identityChanged
                ? t('settings.mailbox.passwordKeep')
                : t('settings.mailbox.passwordPlaceholder')
            }
            autoComplete="new-password"
          />
          <Input
            value={form.mailbox}
            onChange={field('mailbox')}
            prefix={t('settings.mailbox.folder')}
            placeholder="INBOX"
          />
          <Select
            value={form.retentionDays}
            onChange={field('retentionDays')}
            optionList={retentionOptions}
            prefix={t('settings.mailbox.retention')}
            style={{ width: '100%' }}
          />
        </div>

        <label className="mailboxPage__switch">
          <Switch checked={form.enabled} onChange={field('enabled')} />
          <span>{t('settings.mailbox.enabled')}</span>
        </label>

        {account != null && (
          <div className="mailboxPage__status">
            <Text type="tertiary" size="small">
              {account.lastSyncAt
                ? t('settings.mailbox.lastSync', { date: format(account.lastSyncAt, true, locale) })
                : t('settings.mailbox.neverSynced')}
            </Text>
            {account.lastSyncError && (
              <Text type="danger" size="small">
                {t('settings.mailbox.lastError', { error: account.lastSyncError })}
              </Text>
            )}
          </div>
        )}

        {account != null && (
          <div className="mailboxPage__actions">
            <Button icon={<IconMail />} loading={busy === 'test'} disabled={dirty} onClick={handleTest}>
              {t('settings.mailbox.test')}
            </Button>
            <Popconfirm
              title={t('settings.mailbox.deleteTitle')}
              content={t('settings.mailbox.deleteConfirm')}
              onConfirm={handleDelete}
            >
              <Button theme="borderless" type="danger" icon={<IconDelete />} loading={busy === 'delete'}>
                {t('settings.mailbox.delete')}
              </Button>
            </Popconfirm>
          </div>
        )}
      </SegmentPart>

      {account != null && (
        <SegmentPart name={t('settings.mailbox.data')} helpText={t('settings.mailbox.dataHelp')}>
          <Popconfirm
            title={t('settings.mailbox.clearTitle')}
            content={t('settings.mailbox.clearConfirm')}
            onConfirm={() => run('clear', deleteAllMailMessages, 'settings.mailbox.cleared')}
          >
            <Button theme="borderless" type="danger" icon={<IconDelete />} loading={busy === 'clear'}>
              {t('settings.mailbox.clear')}
            </Button>
          </Popconfirm>
        </SegmentPart>
      )}

      <SettingsSaveBar dirty={dirty} saving={busy === 'save'} onSave={handleSave} onDiscard={() => setForm(stored)} />
    </div>
  );
}

MailboxPage.displayName = 'MailboxPage';
