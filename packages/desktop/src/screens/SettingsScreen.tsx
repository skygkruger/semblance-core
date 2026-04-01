/**
 * SettingsScreen — Uses the Storybook SettingsNavigator component from @semblance/ui.
 * Thin wrapper that gathers app state, IPC data, and passes it to the Storybook component.
 */

import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { emit, listen } from '@tauri-apps/api/event';
import { SettingsNavigator } from '@semblance/ui';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { ShimmerDescription } from '../components/ShimmerDescription';
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
// StyleProfileCard removed — will be re-added as a proper Settings screen later

/** Model IDs from the BitNet catalog — used to route download progress events */
const BITNET_MODEL_CATALOG_IDS = new Set([
  'bitnet-b1.58-2b4t',
  'falcon-e-1b', 'falcon-e-3b',
  'falcon3-1b-instruct-1.58bit', 'falcon3-3b-instruct-1.58bit',
  'falcon3-7b-instruct-1.58bit', 'falcon3-10b-instruct-1.58bit',
]);

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
  // Search settings state
  const [searchEngine, setSearchEngine] = useState<string>('searxng');
  const [searchBraveApiKey, setSearchBraveApiKey] = useState<string>('');
  const [searchSearxngUrl, setSearchSearxngUrl] = useState<string>('https://search.veridian.run');
  const [searchSaving, setSearchSaving] = useState(false);

  const [privacyStatus, setPrivacyStatus] = useState<'clean' | 'review-needed'>('clean');

  // Cron job state
  const [cronJobs, setCronJobs] = useState<Array<{ id: string; name: string; schedule: string; enabled: boolean; lastFiredAt: string | null; nextFireAt: string }>>([]);

  // Knowledge graph state
  const [knowledgeStats, setKnowledgeStats] = useState<{
    totalDocuments: number;
    totalEntities: number;
    totalRelationships: number;
    sourceBreakdown: Array<{ source: string; count: number; lastIndexed: string | null }>;
  } | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  // Autonomy domain overrides (real data)
  const [domainOverrides, setDomainOverrides] = useState<Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'>>({});
  const [actionReviewWindow, setActionReviewWindow] = useState<'30s' | '1m' | '5m'>('5m');
  const [requireConfirmation, setRequireConfirmation] = useState(true);

  // Privacy data sources
  const [dataSources, setDataSources] = useState<Array<{ id: string; name: string; entityCount: number; lastIndexed: string }>>([]);

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
      .then(r => { if (r) setNotifSettings(r); })
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
    // Load privacy audit status — defaults to 'clean' since all data is local-only
    sidecarCall<{ violations?: unknown[] } | null>('privacy_get_audit_status').then((s) => {
      if (s?.violations && (s.violations as unknown[]).length > 0) {
        setPrivacyStatus('review-needed');
      }
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

    // Load cron jobs
    sidecarCall<Array<{ id: string; name: string; schedule: string; enabled: boolean; lastFiredAt: string | null; nextFireAt: string }>>('cron_list_jobs')
      .then((jobs) => { if (Array.isArray(jobs)) setCronJobs(jobs); })
      .catch(() => {});

    // Load knowledge graph stats
    sidecarCall<{
      totalDocuments: number; totalEntities: number; totalRelationships: number;
      sourceBreakdown: Array<{ source: string; count: number; lastIndexed: string | null }>;
    }>('knowledge_get_stats')
      .then((s) => { if (s) setKnowledgeStats(s); })
      .catch(() => {});

    // Load real autonomy domain overrides
    sidecarCall<Record<string, string>>('autonomy_get_config')
      .then((cfg) => {
        if (cfg && typeof cfg === 'object') {
          const overrides: Record<string, 'guardian' | 'partner' | 'alter-ego' | 'default'> = {};
          for (const [domain, tier] of Object.entries(cfg)) {
            const t = (tier as string).replace('_', '-') as 'guardian' | 'partner' | 'alter-ego' | 'default';
            overrides[domain] = t;
          }
          setDomainOverrides(overrides);
        }
      })
      .catch(() => {});

    // Load data sources for privacy
    sidecarCall<Array<{ source: string; count: number; lastIndexed: string | null }>>('knowledge_get_source_breakdown')
      .then((sources) => {
        if (Array.isArray(sources)) {
          setDataSources(sources.map(s => ({
            id: s.source,
            name: s.source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            entityCount: s.count,
            lastIndexed: s.lastIndexed ?? '',
          })));
        }
      })
      .catch(() => {});

  }, [dispatch]);

  // Listen for model download progress events from the sidecar
  useEffect(() => {
    const unlisten = listen<{
      modelId: string;
      totalBytes: number;
      downloadedBytes: number;
      status: string;
    }>('semblance://model-download-progress', (event) => {
      const { modelId, totalBytes, downloadedBytes, status } = event.payload;
      const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
      // Update whichever catalog this model belongs to
      if (BITNET_MODEL_CATALOG_IDS.has(modelId)) {
        setBitnetDownloadingModelId(modelId);
        setBitnetDownloadProgress(progress);
        if (status === 'complete' || status === 'verified') {
          setBitnetDownloadingModelId(null);
          setBitnetDownloadProgress(0);
          // Refresh catalog to show isDownloaded: true
          getBitNetModels().then((res) => setBitnetModels(res.models)).catch(() => {});
        }
      } else {
        setStandardDownloadingModelId(modelId);
        setStandardDownloadProgress(progress);
        if (status === 'complete' || status === 'verified') {
          setStandardDownloadingModelId(null);
          setStandardDownloadProgress(0);
          getStandardModels().then((res) => setStandardModels(res.models)).catch(() => {});
        }
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Retry model catalog load when sidecar reports ready
  // (handles race condition where Settings mounts before sidecar finishes init)
  useEffect(() => {
    const unlisten = listen('semblance://status-update', () => {
      // Sidecar emits status-update after initialization — reload model catalogs
      if (bitnetModels.length === 0) {
        getBitNetModels().then((res) => {
          setBitnetModels(res.models);
          if (res.activeModelId) setBitnetActiveModelId(res.activeModelId);
        }).catch(() => {});
      }
      if (standardModels.length === 0) {
        getStandardModels().then((res) => {
          setStandardModels(res.models);
          if (res.activeModelId) setStandardActiveModelId(res.activeModelId);
        }).catch(() => {});
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [bitnetModels.length, standardModels.length]);

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
    // Handle domain override changes
    if (key.startsWith('domainOverride.')) {
      const domain = key.split('.')[1]!;
      const tier = (value as string).replace('-', '_');
      const updated = { ...domainOverrides, [domain]: value as 'guardian' | 'partner' | 'alter-ego' | 'default' };
      setDomainOverrides(updated);
      if (value === 'default') {
        // Remove override — use global tier
        await setAutonomyTier(domain, (state.autonomyConfig['email'] || 'partner').replace('-', '_') as AutonomyTier).catch(() => {});
      } else {
        await setAutonomyTier(domain, tier as AutonomyTier).catch(() => {});
      }
      return; // Early return since this isn't in the switch
    }

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
      case 'includeWeather':
      case 'includeCalendar':
      case 'remindersEnabled':
      case 'notifyOnAction':
      case 'notifyOnApproval':
      case 'badgeCount':
      case 'soundEffects': {
        const updated = { ...notifSettings, [key]: value };
        setNotifSettings(updated);
        await saveNotificationSettings(updated).catch(() => {});
        break;
      }
      case 'morningBriefTime': {
        const time = value as string;
        const updated = { ...notifSettings, morningBriefTime: time };
        setNotifSettings(updated);
        await saveNotificationSettings(updated).catch(() => {});
        // Also update the cron job schedule
        const [hour, minute] = time.split(':');
        sidecarCall('cron_update_schedule', { jobId: 'morning-brief', schedule: `${minute} ${hour} * * *` }).catch(() => {});
        break;
      }
      case 'defaultSnoozeDuration': {
        const dur = value as string;
        const updated = { ...notifSettings, defaultSnoozeDuration: dur as '5m' | '15m' | '1h' | '1d' };
        setNotifSettings(updated);
        await saveNotificationSettings(updated).catch(() => {});
        break;
      }
      case 'actionDigest': {
        const digest = value as string;
        const updated = { ...notifSettings, actionDigest: digest as 'immediate' | 'hourly' | 'daily' };
        setNotifSettings(updated);
        await saveNotificationSettings(updated).catch(() => {});
        break;
      }
      case 'actionReviewWindow': {
        const window = value as '30s' | '1m' | '5m';
        setActionReviewWindow(window);
        sidecarCall('autonomy_set_review_window', { window }).catch(() => {});
        break;
      }
      case 'requireConfirmationForIrreversible': {
        const req = value as boolean;
        setRequireConfirmation(req);
        sidecarCall('autonomy_set_require_confirmation', { required: req }).catch(() => {});
        break;
      }
      default:
        break;
    }
  }, [dispatch, notifSettings, domainOverrides, state.autonomyConfig]);

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
      // Refresh from bridge to confirm what was actually saved
      const saved = await getSearchSettings().catch(() => null);
      if (saved) {
        const raw = saved as unknown as { engine?: string; braveApiKey?: string; searxngUrl?: string; provider?: string };
        setSearchEngine(raw.engine ?? raw.provider ?? 'searxng');
        setSearchBraveApiKey(raw.braveApiKey ?? '');
        setSearchSearxngUrl(raw.searxngUrl ?? 'https://search.veridian.run');
      }
      showToast('Search settings saved');
    } catch {
      showToast('Failed to save search settings');
    } finally {
      setSearchSaving(false);
    }
  }, [showToast]);

  const handleToggleCronJob = useCallback(async (jobId: string, enabled: boolean) => {
    try {
      await sidecarCall(enabled ? 'cron_enable_job' : 'cron_disable_job', { jobId });
      setCronJobs(prev => prev.map(j => j.id === jobId ? { ...j, enabled } : j));
    } catch {
      showToast('Failed to update scheduled job');
    }
  }, [showToast]);

  const handleReindex = useCallback(async () => {
    setIsReindexing(true);
    try {
      await sidecarCall('knowledge_reindex');
      showToast('Re-indexing started');
      // Refresh stats after a delay
      setTimeout(() => {
        sidecarCall<typeof knowledgeStats>('knowledge_get_stats')
          .then((s) => { if (s) setKnowledgeStats(s); })
          .catch(() => {});
        setIsReindexing(false);
      }, 3000);
    } catch {
      showToast('Re-indexing failed');
      setIsReindexing(false);
    }
  }, [showToast, knowledgeStats]);

  const handleClearKnowledgeSource = useCallback(async (source: string) => {
    try {
      await sidecarCall('knowledge_clear_source', { source });
      setDataSources(prev => prev.filter(s => s.id !== source));
      // Refresh stats
      sidecarCall<typeof knowledgeStats>('knowledge_get_stats')
        .then((s) => { if (s) setKnowledgeStats(s); })
        .catch(() => {});
      showToast(`Cleared ${source} data`);
    } catch {
      showToast('Failed to clear source');
    }
  }, [showToast, knowledgeStats]);

  const handleBitNetDelete = useCallback(async (modelId: string) => {
    try {
      await sidecarCall('bitnet_delete_model', { modelId });
      const res = await getBitNetModels();
      setBitnetModels(res.models);
      if (bitnetActiveModelId === modelId) setBitnetActiveModelId(null);
      showToast('Model deleted');
    } catch {
      showToast('Failed to delete model');
    }
  }, [showToast, bitnetActiveModelId]);

  const handleStandardDelete = useCallback(async (modelId: string) => {
    try {
      await sidecarCall('standard_delete_model', { modelId });
      const res = await getStandardModels();
      setStandardModels(res.models);
      if (standardActiveModelId === modelId) setStandardActiveModelId(null);
      showToast('Model deleted');
    } catch {
      showToast('Failed to delete model');
    }
  }, [showToast, standardActiveModelId]);

  const licenseStatus = license.tier === 'founding'
    ? 'founding-member' as const
    : license.isPremium
      ? 'active' as const
      : 'free' as const;

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Configure your sovereign AI to work exactly how you want.">
        <h1 className="page-title" style={{ fontSize: 28, maxWidth: 720, width: '100%', margin: '0 auto' }}>{t('screen.settings.title', 'Settings')}</h1>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <ShimmerDescription text="Configure your sovereign AI" />
        </div>
        <style>{`.settings-header { display: none; }`}</style>
        <SettingsNavigator
          /* Root props */
          currentModel={state.activeModel || 'Loading...'}
          activeConnections={connectedAccounts}
          notificationSummary={t('screen.settings.notifications_default')}
          autonomyTier={autonomyTier}
          privacyStatus={privacyStatus}
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
          onBitNetDelete={handleBitNetDelete}

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
          onStandardDelete={handleStandardDelete}

          /* Connections props */
          connections={accounts.map(a => ({
            id: `${a.serviceType}:${a.username}`,
            name: a.displayName,
            category: a.serviceType,
            categoryColor: '#6ECFA3',
            isConnected: a.connected,
            lastSync: a.lastSyncedAt ?? null,
            entityCount: a.indexedCount ?? 0,
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
          domainOverrides={domainOverrides}
          requireConfirmationForIrreversible={requireConfirmation}
          actionReviewWindow={actionReviewWindow}

          /* Privacy props */
          lastAuditTime={null}
          auditStatus={privacyStatus === 'review-needed' ? 'review-needed' : 'never-run'}
          dataSources={dataSources}

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

          cronJobs={cronJobs}
          onToggleCronJob={handleToggleCronJob}
          cronJobCount={cronJobs.filter(j => j.enabled).length}

          /* Web Search */
          searchEngine={searchEngine}
          searchBraveApiKey={searchBraveApiKey}
          searchSearxngUrl={searchSearxngUrl}
          searchSaving={searchSaving}
          onSearchSave={handleSearchSave}

          knowledgeStats={knowledgeStats}
          knowledgeDocCount={knowledgeStats?.totalDocuments ?? 0}
          isReindexing={isReindexing}
          onReindex={handleReindex}
          onClearKnowledgeSource={handleClearKnowledgeSource}
        />
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
