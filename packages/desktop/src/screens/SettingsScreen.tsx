/**
 * SettingsScreen — Uses the Storybook SettingsNavigator component from @semblance/ui.
 * Thin wrapper that gathers app state, IPC data, and passes it to the Storybook component.
 */

import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { emit } from '@tauri-apps/api/event';
import { SettingsNavigator } from '@semblance/ui';
import type { AutonomyTier } from '@semblance/ui';
import {
  getAccountsStatus,
  detectHardware,
  setUserName,
  setAiName,
  setAutonomyTier,
  selectModel,
  getAlterEgoSettings,
  updateAlterEgoSettings,
  getStyleProfile,
  getNotificationSettings,
  saveNotificationSettings,
} from '../ipc/commands';
import type { NotificationSettings } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import type { AccountStatus } from '../ipc/types';

export function SettingsScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const license = useLicense();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [hardwareProfile, setHardwareProfile] = useState('');
  const [appVersion, setAppVersion] = useState('0.1.0');
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    morningBriefEnabled: true,
    morningBriefTime: '07:00',
    includeWeather: true,
    includeCalendar: true,
    remindersEnabled: true,
    defaultSnoozeDuration: '15m',
    notifyOnAction: true,
    notifyOnApproval: true,
    actionDigest: 'daily',
    badgeCount: true,
    soundEffects: true,
  });

  useEffect(() => {
    getAccountsStatus()
      .then(setAccounts)
      .catch(() => {});
    detectHardware()
      .then((hw) => setHardwareProfile(`${hw.os} — ${hw.cpuCores} cores, ${Math.round((hw.totalRamMb ?? 0) / 1024)}GB RAM`))
      .catch(() => setHardwareProfile('Unknown'));
    getAlterEgoSettings()
      .then((s) => dispatch({ type: 'SET_ALTER_EGO_SETTINGS', settings: s }))
      .catch(() => {});
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
    getNotificationSettings()
      .then(setNotifSettings)
      .catch(() => {});
  }, [dispatch]);

  // Toast helper for features not yet wired
  const showToast = useCallback((message: string) => {
    emit('semblance://toast', {
      id: `toast_${Date.now()}`,
      message,
      variant: 'info',
    }).catch(() => {});
  }, []);

  const defaultTier = (state.autonomyConfig['email'] || 'partner') as string;
  const autonomyTier = defaultTier === 'alter_ego' ? 'alter-ego' : defaultTier as 'guardian' | 'partner' | 'alter-ego';

  const connectedAccounts = accounts.filter(a => a.connected).length;

  const handleChange = useCallback(async (key: string, value: unknown) => {
    switch (key) {
      case 'autonomyTier': {
        const tier = (value as string).replace('-', '_') as AutonomyTier;
        const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
        for (const domain of domains) {
          dispatch({ type: 'SET_AUTONOMY_TIER', domain, tier });
          await setAutonomyTier(domain, tier).catch(() => {});
        }
        break;
      }
      case 'semblanceName': {
        const name = value as string;
        dispatch({ type: 'SET_SEMBLANCE_NAME', name });
        break;
      }
      case 'activeModel': {
        const model = value as string;
        dispatch({ type: 'SET_ACTIVE_MODEL', model });
        await selectModel(model).catch(() => {});
        break;
      }
      // Notification settings — persist via IPC
      case 'morningBriefEnabled':
      case 'morningBriefTime':
      case 'includeWeather':
      case 'includeCalendar':
      case 'remindersEnabled':
      case 'defaultSnoozeDuration':
      case 'notifyOnAction':
      case 'notifyOnApproval':
      case 'actionDigest':
      case 'badgeCount':
      case 'soundEffects': {
        const updated = { ...notifSettings, [key]: value };
        setNotifSettings(updated);
        await saveNotificationSettings(updated).catch(() => {});
        break;
      }
      default:
        break;
    }
  }, [dispatch]);

  const licenseStatus = license.tier === 'founding'
    ? 'founding-member' as const
    : license.isPremium
      ? 'active' as const
      : 'free' as const;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <SettingsNavigator
          /* Root props */
          currentModel={state.activeModel || 'Loading...'}
          activeConnections={connectedAccounts}
          notificationSummary={t('screen.settings.notifications_default')}
          autonomyTier={autonomyTier}
          privacyStatus="clean"
          licenseStatus={licenseStatus}
          appVersion={appVersion}

          /* AI Engine props */
          modelName={state.activeModel || 'Loading...'}
          modelSize={state.activeModel ? '' : 'Detecting...'}
          hardwareProfile={hardwareProfile}
          isModelRunning={state.ollamaStatus === 'connected'}
          inferenceThreads="auto"
          contextWindow={state.activeModel?.toLowerCase().includes('qwen') ? 32768 : 8192}
          gpuAcceleration={hardwareProfile?.includes('nvidia') || hardwareProfile?.includes('gpu') || false}
          customModelPath={null}

          /* Connections props */
          connections={accounts.map(a => ({
            id: `${a.serviceType}:${a.username}`,
            name: a.displayName,
            category: a.serviceType,
            categoryColor: '#6ECFA3',
            isConnected: a.connected,
            lastSync: null,
            entityCount: 0,
          }))}

          /* Notifications props — loaded from sidecar via IPC */
          morningBriefEnabled={notifSettings.morningBriefEnabled}
          morningBriefTime={notifSettings.morningBriefTime}
          includeWeather={notifSettings.includeWeather}
          includeCalendar={notifSettings.includeCalendar}
          remindersEnabled={notifSettings.remindersEnabled}
          defaultSnoozeDuration={notifSettings.defaultSnoozeDuration}
          notifyOnAction={notifSettings.notifyOnAction}
          notifyOnApproval={notifSettings.notifyOnApproval}
          actionDigest={notifSettings.actionDigest}
          badgeCount={notifSettings.badgeCount}
          soundEffects={notifSettings.soundEffects}

          /* Autonomy props */
          domainOverrides={{}}
          requireConfirmationForIrreversible
          actionReviewWindow="5m"

          /* Privacy props */
          lastAuditTime={null}
          auditStatus="never-run"
          dataSources={[]}

          /* Account props */
          licenseActivationDate={new Date().toISOString().split('T')[0]!}
          digitalRepresentativeActive={license.isPremium}
          digitalRepresentativeActivationDate={license.isPremium ? new Date().toISOString().split('T')[0]! : null}
          semblanceName={state.semblanceName || 'Semblance'}

          /* Callbacks */
          onChange={handleChange}
          onManageAllConnections={() => navigate('/connections')}
          onConnectionTap={() => navigate('/connections')}
          onRunAudit={() => navigate('/privacy')}
          onExportData={() => showToast('Data export coming in a future update')}
          onExportHistory={() => showToast('History export coming in a future update')}
          onDeleteSourceData={() => showToast('Source data deletion coming in a future update')}
          onDeleteAllData={() => showToast('Full data deletion coming in a future update')}
          onResetSemblance={() => showToast('Reset coming in a future update')}
          onRenewLicense={() => navigate('/upgrade')}
          onActivateDigitalRepresentative={() => navigate('/upgrade')}
          onViewDRAgreement={() => showToast('Agreement details coming in a future update')}
          onRenameSemblance={async (name) => {
            dispatch({ type: 'SET_SEMBLANCE_NAME', name });
            await setAiName(name).catch(() => {});
          }}
          onSignOut={() => showToast('Sign out coming in a future update')}
          onDeactivateLicense={() => showToast('License deactivation coming in a future update')}
          onNavigateIntents={() => navigate('/settings/intents')}
        />
      </div>
    </div>
  );
}
