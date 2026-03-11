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
} from '../ipc/commands';
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

          /* Notifications props — TODO: Load from preferences via get_notification_settings IPC */
          morningBriefEnabled
          morningBriefTime="07:00"
          includeWeather
          includeCalendar
          remindersEnabled
          defaultSnoozeDuration="15m"
          notifyOnAction
          notifyOnApproval
          actionDigest="daily"
          badgeCount
          soundEffects

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
        />
        {/* Intent settings — rendered as a row matching Settings card styling */}
        <div style={{ marginTop: 12, borderRadius: 'var(--r-md)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <button
            type="button"
            className="settings-row"
            onClick={() => navigate('/settings/intents')}
            style={{ borderBottom: 'none' }}
          >
            <span className="settings-row__label">{t('screen.settings.intents_hard_limits')}</span>
            <span className="settings-row__chevron">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#5E6B7C' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
