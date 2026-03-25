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
  getNotificationSettings,
  saveNotificationSettings,
  getActionLog,
  getKnowledgeStats,
  exportKnowledgeGraph,
  clearAllConversations,
  getBitNetModels,
  downloadBitNetModel,
  activateBitNetModel,
  getStandardModels,
  downloadStandardModel,
  activateStandardModel,
  prefResetAll,
  prefClearSession,
  prefDelete,
  getChannelList,
  getSessionList,
  getTunnelPairedDevices,
  getHighConfidencePreferences,
  getSkillList,
  getBinaryAllowlistList,
  getDarkPatternFlags,
  getBackupStatus,
  clearKnowledgeData,
  clearAllData,
  sidecarCall,
  getSearchSettings,
  saveSearchSettings,
} from '../ipc/commands';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { NotificationSettings, BitNetModelIPC } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import type { AccountStatus } from '../ipc/types';
import { StyleProfileCard } from '../components/StyleProfileCard';

export function SettingsScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const license = useLicense();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [hardwareProfile, setHardwareProfile] = useState('');
  const [appVersion, setAppVersion] = useState('0.1.0');
  const [bitnetModels, setBitnetModels] = useState<BitNetModelIPC[]>([]);
  const [bitnetActiveModelId, setBitnetActiveModelId] = useState<string | null>(null);
  const [bitnetDownloadingModelId, setBitnetDownloadingModelId] = useState<string | null>(null);
  const [bitnetDownloadProgress, setBitnetDownloadProgress] = useState(0);
  const [standardModels, setStandardModels] = useState<BitNetModelIPC[]>([]);
  const [standardActiveModelId, setStandardActiveModelId] = useState<string | null>(null);
  const [standardDownloadingModelId, setStandardDownloadingModelId] = useState<string | null>(null);
  const [standardDownloadProgress, setStandardDownloadProgress] = useState(0);
  // Sprint WIRE: badge props for expanded settings sections
  const [channelCount, setChannelCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [pairedDeviceCount, setPairedDeviceCount] = useState(0);
  const [preferenceCount, setPreferenceCount] = useState(0);
  const [installedSkillCount, setInstalledSkillCount] = useState(0);
  const [livingWillLastBackup, setLivingWillLastBackup] = useState<string | null>(null);
  const [witnessAttestationCount, setWitnessAttestationCount] = useState(0);
  const [inheritanceConfigured, setInheritanceConfigured] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [binaryAllowlistCount, setBinaryAllowlistCount] = useState(0);
  const [adversarialAlertCount, setAdversarialAlertCount] = useState(0);
  const [styleProfile, setStyleProfile] = useState<{
    id: string;
    isActive: boolean;
    emailsAnalyzed: number;
    greetingPatterns: Array<{ text: string; frequency: number }>;
    signoffPatterns: Array<{ text: string; frequency: number }>;
    formalityScore: number;
    directnessScore: number;
    warmthScore: number;
    usesContractions: boolean;
    contractionRate: number;
    usesEmoji: boolean;
    emojiFrequency: number;
    usesExclamation: boolean;
    exclamationRate: number;
  } | null>(null);

  // Search settings state
  const [searchEngine, setSearchEngine] = useState<string>('searxng');
  const [searchBraveApiKey, setSearchBraveApiKey] = useState<string>('');
  const [searchSearxngUrl, setSearchSearxngUrl] = useState<string>('https://search.veridian.run');
  const [searchSaving, setSearchSaving] = useState(false);

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
    getBitNetModels()
      .then((res) => {
        setBitnetModels(res.models);
        if (res.activeModelId) setBitnetActiveModelId(res.activeModelId);
      })
      .catch(() => {});
    getStandardModels()
      .then((res) => {
        setStandardModels(res.models);
        if (res.activeModelId) setStandardActiveModelId(res.activeModelId);
      })
      .catch(() => {});

    // Sprint WIRE: fetch badge counts for expanded settings sections
    getChannelList().then((r) => { if (Array.isArray(r)) setChannelCount(r.filter((c) => c.connected).length); }).catch(() => {});
    getSessionList().then((r) => { if (Array.isArray(r)) setSessionCount(r.length); }).catch(() => {});
    getTunnelPairedDevices().then((r) => { if (Array.isArray(r)) setPairedDeviceCount(r.length); }).catch(() => {});
    getHighConfidencePreferences().then((r) => { if (Array.isArray(r)) setPreferenceCount(r.length); }).catch(() => {});
    getSkillList().then((r) => { if (Array.isArray(r)) setInstalledSkillCount(r.filter((s) => s.enabled).length); }).catch(() => {});
    getBinaryAllowlistList().then((r) => { if (Array.isArray(r)) setBinaryAllowlistCount(r.length); }).catch(() => {});
    getDarkPatternFlags().then((r) => { if (Array.isArray(r)) setAdversarialAlertCount(r.filter((f) => !(f as unknown as { dismissed?: boolean }).dismissed).length); }).catch(() => {});
    sidecarCall<{ entryCount?: number }>('audit_get_chain_status').then((s) => { setWitnessAttestationCount(s?.entryCount ?? 0); }).catch(() => {});
    sidecarCall<{ available?: boolean }>('hw_key_get_info', { keyId: null }).then((s) => { setBiometricEnabled(!!s?.available); }).catch(() => {});
    sidecarCall<Array<{ createdAt?: string }>>('living_will_get_history').then((r) => {
      if (Array.isArray(r) && r.length > 0) {
        const sorted = r.sort((a, b) =>
          (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
        setLivingWillLastBackup(sorted[0]?.createdAt ?? null);
      }
    }).catch(() => {});
    sidecarCall<{ enabled?: boolean } | null>('inheritance_get_config').then((cfg) => {
      setInheritanceConfigured(!!cfg?.enabled);
    }).catch(() => {});
    getBackupStatus().then((s) => {
      if (s?.lastBackupAt) setLastBackupAt(s.lastBackupAt);
    }).catch(() => {});
    // Load search settings
    getSearchSettings()
      .then((s) => {
        // Bridge returns { engine, braveApiKey, searxngUrl } — map to our state
        const raw = s as unknown as { engine?: string; braveApiKey?: string; searxngUrl?: string; provider?: string };
        setSearchEngine(raw.engine ?? raw.provider ?? 'searxng');
        setSearchBraveApiKey(raw.braveApiKey ?? '');
        setSearchSearxngUrl(raw.searxngUrl ?? 'https://search.veridian.run');
      })
      .catch(() => {});

    // Load style profile
    sidecarCall<{
      id: string;
      isActive: boolean;
      emailsAnalyzed: number;
      greetings: { patterns: Array<{ text: string; frequency: number }> };
      signoffs: { patterns: Array<{ text: string; frequency: number }> };
      tone: { formalityScore: number; directnessScore: number; warmthScore: number };
      vocabulary: { usesContractions: boolean; contractionRate: number; usesEmoji: boolean; emojiFrequency: number; usesExclamation: boolean; exclamationRate: number };
    } | null>('style_get_profile').then((p) => {
      if (p) {
        setStyleProfile({
          id: p.id,
          isActive: p.isActive,
          emailsAnalyzed: p.emailsAnalyzed,
          greetingPatterns: p.greetings?.patterns ?? [],
          signoffPatterns: p.signoffs?.patterns ?? [],
          formalityScore: p.tone?.formalityScore ?? 50,
          directnessScore: p.tone?.directnessScore ?? 50,
          warmthScore: p.tone?.warmthScore ?? 50,
          usesContractions: p.vocabulary?.usesContractions ?? false,
          contractionRate: p.vocabulary?.contractionRate ?? 0,
          usesEmoji: p.vocabulary?.usesEmoji ?? false,
          emojiFrequency: p.vocabulary?.emojiFrequency ?? 0,
          usesExclamation: p.vocabulary?.usesExclamation ?? false,
          exclamationRate: p.vocabulary?.exclamationRate ?? 0,
        });
      }
    }).catch(() => {});
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
        await setAiName(name).catch(() => {});
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

  const handleBitNetDownload = useCallback(async (modelId: string) => {
    setBitnetDownloadingModelId(modelId);
    setBitnetDownloadProgress(0);
    try {
      await downloadBitNetModel(modelId);
      const res = await getBitNetModels();
      setBitnetModels(res.models);
      showToast(t('screen.settings.toast_model_downloaded'));
    } catch {
      showToast(t('screen.settings.toast_model_download_failed'));
    } finally {
      setBitnetDownloadingModelId(null);
      setBitnetDownloadProgress(0);
    }
  }, [showToast, t]);

  const handleBitNetActivate = useCallback(async (modelId: string) => {
    try {
      await activateBitNetModel(modelId);
      setBitnetActiveModelId(modelId);
      setStandardActiveModelId(null);
      showToast(t('screen.settings.toast_model_activated'));
    } catch {
      showToast(t('screen.settings.toast_model_activation_failed'));
    }
  }, [showToast, t]);

  const handleStandardDownload = useCallback(async (modelId: string) => {
    setStandardDownloadingModelId(modelId);
    setStandardDownloadProgress(0);
    try {
      await downloadStandardModel(modelId);
      const res = await getStandardModels();
      setStandardModels(res.models);
      showToast(t('screen.settings.toast_model_downloaded'));
    } catch {
      showToast(t('screen.settings.toast_model_download_failed'));
    } finally {
      setStandardDownloadingModelId(null);
      setStandardDownloadProgress(0);
    }
  }, [showToast, t]);

  const handleStandardActivate = useCallback(async (modelId: string) => {
    try {
      await activateStandardModel(modelId);
      setStandardActiveModelId(modelId);
      setBitnetActiveModelId(null);
      showToast(t('screen.settings.toast_model_activated'));
    } catch {
      showToast(t('screen.settings.toast_model_activation_failed'));
    }
  }, [showToast, t]);

  const handleSearchSave = useCallback(async (engine: string, braveApiKey: string, searxngUrl: string) => {
    setSearchSaving(true);
    try {
      await saveSearchSettings({
        provider: engine,
        braveApiKey: engine === 'brave' ? braveApiKey : null,
        searxngUrl: engine === 'searxng' ? searxngUrl : null,
        rateLimit: 10,
      });
      showToast('Search settings saved');
    } catch {
      showToast('Failed to save search settings');
    } finally {
      setSearchSaving(false);
    }
  }, [showToast]);

  const licenseStatus = license.tier === 'founding'
    ? 'founding-member' as const
    : license.isPremium
      ? 'active' as const
      : 'free' as const;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-container-lg mx-auto px-6 py-8">
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

          /* BitNet Model Management */
          bitnetModels={bitnetModels.map(m => ({
            id: m.id,
            displayName: m.displayName,
            family: m.family,
            parameterCount: m.parameterCount,
            fileSizeBytes: m.fileSizeBytes,
            ramRequiredMb: m.ramRequiredMb,
            license: m.license,
            nativeOneBit: m.nativeOneBit,
            contextLength: m.contextLength,
            isDownloaded: m.isDownloaded,
            isRecommended: m.isRecommended,
          }))}
          bitnetActiveModelId={bitnetActiveModelId}
          bitnetDownloadingModelId={bitnetDownloadingModelId}
          bitnetDownloadProgress={bitnetDownloadProgress}
          onBitNetDownload={handleBitNetDownload}
          onBitNetActivate={handleBitNetActivate}

          /* Standard Model Management */
          standardModels={standardModels.map(m => ({
            id: m.id,
            displayName: m.displayName,
            family: m.family,
            parameterCount: m.parameterCount,
            fileSizeBytes: m.fileSizeBytes,
            ramRequiredMb: m.ramRequiredMb,
            license: m.license,
            nativeOneBit: m.nativeOneBit,
            contextLength: m.contextLength,
            isDownloaded: m.isDownloaded,
            isRecommended: m.isRecommended,
          }))}
          standardActiveModelId={standardActiveModelId}
          standardDownloadingModelId={standardDownloadingModelId}
          standardDownloadProgress={standardDownloadProgress}
          onStandardDownload={handleStandardDownload}
          onStandardActivate={handleStandardActivate}

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
              await exportKnowledgeGraph();
              showToast(t('screen.settings.toast_knowledge_exported'));
            } catch {
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
                showToast(t('screen.settings.toast_knowledge_exported_json'));
              } catch {
                showToast(t('screen.settings.toast_export_failed'));
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
              showToast(t('screen.settings.toast_history_exported', { count: entries.length }));
            } catch {
              showToast(t('screen.settings.toast_history_export_failed'));
            }
          }}
          onDeleteSourceData={async () => {
            const confirmed = await confirm(
              t('screen.settings.confirm_delete_source'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!confirmed) return;
            exportKnowledgeGraph()
              .catch(() => {})
              .finally(() => {
                clearAllConversations(false).catch(() => {});
                clearKnowledgeData().catch(() => {});
                showToast(t('screen.settings.toast_source_data_deleted'));
              });
          }}
          onDeleteAllData={async () => {
            const confirmed = await confirm(
              t('screen.settings.confirm_delete_all'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!confirmed) return;
            // Second confirmation — use Tauri confirm with explicit text
            const doubleConfirmed = await confirm(
              t('screen.settings.confirm_delete_all_prompt'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!doubleConfirmed) {
              showToast(t('screen.settings.toast_deletion_cancelled'));
              return;
            }
            clearAllConversations(false).catch(() => {});
            clearKnowledgeData().catch(() => {});
            clearAllData().catch(() => {});
            prefResetAll().catch(() => {});
            showToast(t('screen.settings.toast_all_data_deleted'));
          }}
          onResetSemblance={async () => {
            const confirmed = await confirm(
              t('screen.settings.confirm_factory_reset'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!confirmed) return;
            const doubleConfirmed = await confirm(
              t('screen.settings.confirm_factory_reset_prompt'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!doubleConfirmed) {
              showToast(t('screen.settings.toast_reset_cancelled'));
              return;
            }
            clearAllConversations(false).catch(() => {});
            clearAllData().catch(() => {});
            clearKnowledgeData().catch(() => {});
            prefResetAll().catch(() => {});
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast(t('screen.settings.toast_factory_reset'));
            setTimeout(() => window.location.reload(), 1500);
          }}
          onRenewLicense={() => navigate('/upgrade')}
          onActivateDigitalRepresentative={() => navigate('/upgrade')}
          onViewDRAgreement={async () => {
            await confirm(
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
              'Semblance acts as your agent, not ours. Your intelligence. Your device. Your rules.',
              { title: 'Digital Representative Agreement', kind: 'info' },
            );
          }}
          onRenameSemblance={async (name) => {
            dispatch({ type: 'SET_SEMBLANCE_NAME', name });
            await setAiName(name).catch(() => {});
          }}
          onSignOut={async () => {
            const confirmed = await confirm(
              t('screen.settings.confirm_sign_out'),
              { title: t('button.confirm'), kind: 'info' },
            );
            if (!confirmed) return;
            prefClearSession().catch(() => {});
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast(t('screen.settings.toast_signed_out'));
          }}
          onDeactivateLicense={async () => {
            const confirmed = await confirm(
              t('screen.settings.confirm_deactivate_license'),
              { title: t('button.confirm'), kind: 'warning' },
            );
            if (!confirmed) return;
            prefDelete('semblance.license.key').catch(() => {});
            prefDelete('semblance.license.tier').catch(() => {});
            prefDelete('semblance.license.activated').catch(() => {});
            dispatch({
              type: 'SET_LICENSE',
              license: { tier: 'free', isFoundingMember: false, foundingSeat: null, licenseKey: null },
            });
            showToast(t('screen.settings.toast_license_deactivated'));
          }}
          onNavigateIntents={() => navigate('/settings/intents')}
          onNavigateExternal={(path) => navigate(path)}

          /* Sprint WIRE: badge props */
          channelCount={channelCount}
          sessionCount={sessionCount}
          pairedDeviceCount={pairedDeviceCount}
          preferenceCount={preferenceCount}
          installedSkillCount={installedSkillCount}
          livingWillLastBackup={livingWillLastBackup}
          witnessAttestationCount={witnessAttestationCount}
          inheritanceConfigured={inheritanceConfigured}
          biometricEnabled={biometricEnabled}
          lastBackupAt={lastBackupAt}
          binaryAllowlistCount={binaryAllowlistCount}
          adversarialAlertCount={adversarialAlertCount}
        />
        {/* ─── Web Search Settings ──────────────────────────────────── */}
        <div className="mt-6" style={{ background: '#111518', border: '1px solid #1E2227', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 18, color: '#EEF1F4', marginBottom: 16 }}>
            Web Search
          </h3>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#8593A4', marginBottom: 20 }}>
            Choose which search engine Semblance uses for web queries.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {([
              { value: 'searxng', label: 'SearXNG', desc: 'Self-hosted, private meta-search' },
              { value: 'duckduckgo', label: 'DuckDuckGo', desc: 'Zero-config privacy search' },
              { value: 'brave', label: 'Brave Search', desc: 'Requires API key' },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                  padding: '10px 12px', borderRadius: 8,
                  background: searchEngine === opt.value ? '#1A1F24' : 'transparent',
                  border: searchEngine === opt.value ? '1px solid #2A3038' : '1px solid transparent',
                }}
              >
                <input
                  type="radio"
                  name="searchEngine"
                  value={opt.value}
                  checked={searchEngine === opt.value}
                  onChange={() => setSearchEngine(opt.value)}
                  style={{ marginTop: 3, accentColor: '#6ECFA3' }}
                />
                <div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: '#EEF1F4' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#5E6B7C', marginTop: 2 }}>
                    {opt.desc}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* SearXNG URL field */}
          {searchEngine === 'searxng' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#8593A4', display: 'block', marginBottom: 6 }}>
                SearXNG Instance URL
              </label>
              <input
                type="url"
                value={searchSearxngUrl}
                onChange={(e) => setSearchSearxngUrl(e.target.value)}
                placeholder="https://search.veridian.run"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6,
                  background: '#0B0E11', border: '1px solid #2A3038', color: '#EEF1F4',
                  fontFamily: "'DM Mono', monospace", fontSize: 13, outline: 'none',
                }}
              />
            </div>
          )}

          {/* Brave API key field */}
          {searchEngine === 'brave' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#8593A4', display: 'block', marginBottom: 6 }}>
                Brave Search API Key
              </label>
              <input
                type="password"
                value={searchBraveApiKey}
                onChange={(e) => setSearchBraveApiKey(e.target.value)}
                placeholder="BSA..."
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6,
                  background: '#0B0E11', border: '1px solid #2A3038', color: '#EEF1F4',
                  fontFamily: "'DM Mono', monospace", fontSize: 13, outline: 'none',
                }}
              />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#5E6B7C', marginTop: 4 }}>
                Get a key at brave.com/search/api
              </p>
            </div>
          )}

          <button
            onClick={() => handleSearchSave(searchEngine, searchBraveApiKey, searchSearxngUrl)}
            disabled={searchSaving}
            style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #6ECFA3',
              background: 'transparent', color: '#6ECFA3', cursor: searchSaving ? 'wait' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
              opacity: searchSaving ? 0.5 : 1,
            }}
          >
            {searchSaving ? 'Saving...' : 'Save Search Settings'}
          </button>
        </div>

        <div className="mt-6">
          <StyleProfileCard
            profile={styleProfile}
            onReanalyze={() => {
              sidecarCall('style_reanalyze').then(() => {
                // Reload profile after re-analysis
                sidecarCall<{
                  id: string; isActive: boolean; emailsAnalyzed: number;
                  greetings: { patterns: Array<{ text: string; frequency: number }> };
                  signoffs: { patterns: Array<{ text: string; frequency: number }> };
                  tone: { formalityScore: number; directnessScore: number; warmthScore: number };
                  vocabulary: { usesContractions: boolean; contractionRate: number; usesEmoji: boolean; emojiFrequency: number; usesExclamation: boolean; exclamationRate: number };
                } | null>('style_get_profile').then((p) => {
                  if (p) {
                    setStyleProfile({
                      id: p.id, isActive: p.isActive, emailsAnalyzed: p.emailsAnalyzed,
                      greetingPatterns: p.greetings?.patterns ?? [], signoffPatterns: p.signoffs?.patterns ?? [],
                      formalityScore: p.tone?.formalityScore ?? 50, directnessScore: p.tone?.directnessScore ?? 50,
                      warmthScore: p.tone?.warmthScore ?? 50, usesContractions: p.vocabulary?.usesContractions ?? false,
                      contractionRate: p.vocabulary?.contractionRate ?? 0, usesEmoji: p.vocabulary?.usesEmoji ?? false,
                      emojiFrequency: p.vocabulary?.emojiFrequency ?? 0, usesExclamation: p.vocabulary?.usesExclamation ?? false,
                      exclamationRate: p.vocabulary?.exclamationRate ?? 0,
                    });
                  }
                }).catch(() => {});
                showToast('Style profile re-analyzed');
              }).catch(() => { showToast('Re-analysis failed'); });
            }}
            onReset={() => {
              sidecarCall('style_reset').then(() => {
                setStyleProfile(null);
                showToast('Style profile reset');
              }).catch(() => { showToast('Reset failed'); });
            }}
          />
        </div>
      </div>
    </div>
  );
}
