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
  getActionLog,
  getKnowledgeStats,
  exportKnowledgeGraph,
  clearAllConversations,
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
  }, [dispatch, notifSettings]);

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
          onExportData={async () => {
            try {
              // Try the dedicated knowledge graph export IPC first
              await exportKnowledgeGraph();
              showToast('Knowledge graph exported successfully');
            } catch {
              // Fallback: gather stats and export as JSON download
              try {
                const stats = await getKnowledgeStats();
                const exportPayload = {
                  exportedAt: new Date().toISOString(),
                  knowledgeStats: stats,
                };
                const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `semblance-knowledge-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast('Knowledge data exported as JSON');
              } catch {
                showToast('Export failed — no knowledge data available');
              }
            }
          }}
          onExportHistory={async () => {
            try {
              const entries = await getActionLog(10000, 0);
              const exportPayload = {
                exportedAt: new Date().toISOString(),
                entryCount: entries.length,
                entries,
              };
              const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `semblance-action-history-${new Date().toISOString().split('T')[0]}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              showToast(`Exported ${entries.length} action log entries`);
            } catch {
              showToast('History export failed — no action log entries available');
            }
          }}
          onDeleteSourceData={() => {
            const confirmed = window.confirm(
              'Delete all indexed source data? This will remove all documents, embeddings, and knowledge graph entries. This cannot be undone.'
            );
            if (!confirmed) return;
            exportKnowledgeGraph()
              .catch(() => {})
              .finally(() => {
                clearAllConversations(false)
                  .catch(() => {});
                // Clear knowledge via sidecar
                import('@tauri-apps/api/core').then(({ invoke }) => {
                  invoke('sidecar_request', {
                    request: { method: 'clear_knowledge_data', params: {} },
                  }).catch(() => {});
                }).catch(() => {});
                showToast('Source data deletion initiated. Restart recommended.');
              });
          }}
          onDeleteAllData={() => {
            const confirmed = window.confirm(
              'DELETE ALL DATA — This will erase your entire Semblance database including knowledge graph, conversations, action history, preferences, and all indexed content. This cannot be undone.'
            );
            if (!confirmed) return;
            const typed = window.prompt('Type DELETE to confirm permanent data deletion:');
            if (typed !== 'DELETE') {
              showToast('Deletion cancelled — confirmation text did not match');
              return;
            }
            // Clear conversations
            clearAllConversations(false).catch(() => {});
            // Clear knowledge via sidecar
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('sidecar_request', {
                request: { method: 'clear_knowledge_data', params: {} },
              }).catch(() => {});
              invoke('sidecar_request', {
                request: { method: 'clear_all_data', params: {} },
              }).catch(() => {});
            }).catch(() => {});
            // Clear localStorage
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith('semblance.')) localStorage.removeItem(key);
            });
            showToast('All data deleted. Please restart Semblance.');
          }}
          onResetSemblance={() => {
            const confirmed = window.confirm(
              'FACTORY RESET — This will delete ALL data and restore Semblance to its initial state. All knowledge, conversations, preferences, connected accounts, and license data will be erased.'
            );
            if (!confirmed) return;
            const typed = window.prompt('Type RESET to confirm factory reset:');
            if (typed !== 'RESET') {
              showToast('Reset cancelled — confirmation text did not match');
              return;
            }
            // Clear all conversations
            clearAllConversations(false).catch(() => {});
            // Clear all sidecar data
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('sidecar_request', {
                request: { method: 'clear_all_data', params: {} },
              }).catch(() => {});
              invoke('sidecar_request', {
                request: { method: 'clear_knowledge_data', params: {} },
              }).catch(() => {});
            }).catch(() => {});
            // Clear ALL localStorage (not just semblance. prefix)
            localStorage.clear();
            // Reset license state in app
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast('Factory reset complete. Semblance will restart.');
            setTimeout(() => window.location.reload(), 1500);
          }}
          onRenewLicense={() => navigate('/upgrade')}
          onActivateDigitalRepresentative={() => navigate('/upgrade')}
          onViewDRAgreement={() => {
            window.alert(
              'DIGITAL REPRESENTATIVE AGREEMENT\n\n' +
              'By activating Digital Representative features, you agree to the following:\n\n' +
              '1. AUTONOMY — Digital Representative operates under your configured autonomy tier ' +
              '(Guardian, Partner, or Alter Ego). You control how much independence it has.\n\n' +
              '2. AUDIT TRAIL — Every action taken on your behalf is cryptographically logged ' +
              'in a tamper-evident audit trail. You can review, verify, and export this trail at any time.\n\n' +
              '3. REVERSIBILITY — Where possible, actions are reversible. Undo is available ' +
              'from the Action Log for supported action types.\n\n' +
              '4. PRIVACY — Your data never leaves your device. All reasoning, drafting, and ' +
              'decision-making happens locally. Network access is limited to authorized services only.\n\n' +
              '5. YOUR CONTROL — You can revoke Digital Representative access, adjust autonomy tiers, ' +
              'or deactivate entirely at any time from Settings.\n\n' +
              'Semblance acts as your agent, not ours. Your intelligence. Your device. Your rules.'
            );
          }}
          onRenameSemblance={async (name) => {
            dispatch({ type: 'SET_SEMBLANCE_NAME', name });
            await setAiName(name).catch(() => {});
          }}
          onSignOut={() => {
            const confirmed = window.confirm(
              'Sign out of this session? Your license key will remain stored in the OS keychain for easy re-activation.'
            );
            if (!confirmed) return;
            // Clear session-specific state from localStorage
            const sessionKeys = ['semblance.session', 'semblance.lastSync', 'semblance.activeConversation'];
            sessionKeys.forEach((key) => localStorage.removeItem(key));
            // Reset app state license to free tier (keychain retains the key)
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast('Signed out. License key remains in keychain.');
          }}
          onDeactivateLicense={() => {
            const confirmed = window.confirm(
              'Deactivate your license? Premium features (Digital Representative, Morning Brief, Visual Knowledge Graph, etc.) will be disabled immediately. You can re-activate later with your license key.'
            );
            if (!confirmed) return;
            // Clear license from localStorage
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith('semblance.license')) localStorage.removeItem(key);
            });
            // Reset license state in app
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast('License deactivated. Premium features disabled.');
          }}
          onNavigateIntents={() => navigate('/settings/intents')}
        />
      </div>
    </div>
  );
}
