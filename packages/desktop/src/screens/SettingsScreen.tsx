import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Button, StatusIndicator, AutonomySelector, ThemeToggle, CredentialForm, LicenseActivation, FoundingMemberBadge, SettingsAlterEgo } from '@semblance/ui';
import {
  getAccountsStatus,
  getProviderPresets,
  detectHardware,
  setUserName,
  setAutonomyTier,
  addCredential,
  testCredential,
  listCredentials,
  removeCredential,
  selectModel,
  getSearchSettings,
  saveSearchSettings,
  testBraveApiKey,
  getAlterEgoSettings,
  updateAlterEgoSettings,
  triggerSync,
  getStyleProfile,
  reanalyzeStyle,
  resetStyleProfile,
  getVoiceModelStatus,
  downloadVoiceModel,
  getImportHistory,
  startImport,
  getModelDownloadStatus,
  retryModelDownload,
} from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import { HardwareProfileDisplay } from '../components/HardwareProfileDisplay';
import { ClipboardSettingsSection } from '../components/ClipboardSettingsSection';
import { LocationSettingsSection } from '../components/LocationSettingsSection';
import { VoiceSettingsSection } from '../components/VoiceSettingsSection';
import { CloudStorageSettingsSection } from '../components/CloudStorageSettingsSection';
import { SoundSettingsSection } from '../components/SoundSettingsSection';
import { StyleMatchIndicator } from '../components/StyleMatchIndicator';
import { StyleProfileCard } from '../components/StyleProfileCard';
import { VoiceOnboardingCard } from '../components/VoiceOnboardingCard';
import { ModelDownloadProgress } from '../components/ModelDownloadProgress';
import { ImportDigitalLifeView } from '../components/ImportDigitalLifeView';
import type { HardwareDisplayInfo } from '../components/HardwareProfileDisplay';
import type { AutonomyTier } from '@semblance/ui';
import type { ThemeMode } from '@semblance/ui';
import type { CredentialFormData } from '@semblance/ui';
import type { AccountInfo, AccountStatus, StyleProfileResult, VoiceModelStatus, ImportHistoryData, ModelDownloadState } from '../ipc/types';
import './SettingsScreen.css';

function LicenseSection() {
  const { t } = useTranslation();
  const license = useLicense();
  const navigate = useNavigate();

  const tierLabel =
    license.tier === 'digital-representative' ? t('license.digital_representative') :
    license.tier === 'founding' ? t('license.founding') :
    license.tier === 'lifetime' ? t('license.lifetime') :
    t('license.free');

  return (
    <Card>
      <h2 className="settings-page__section-title">
        {t('screen.settings.section_license')}
      </h2>
      <div className="settings-page__vstack">
        <div className="settings-page__hstack--between">
          <div>
            <p className="settings-page__text settings-page__text--medium">
              {tierLabel}
            </p>
            <p className="settings-page__text settings-page__text--secondary">
              {license.isPremium ? t('license.premium_desc') : t('license.free_desc')}
            </p>
          </div>
          {license.isFoundingMember && license.foundingSeat !== null && (
            <FoundingMemberBadge seat={license.foundingSeat} variant="inline" />
          )}
        </div>

        {!license.isPremium && (
          <Button
            variant="solid"
            size="sm"
            onClick={() => navigate('/upgrade')}
          >
            {t('button.upgrade')}
          </Button>
        )}

        {license.isPremium && license.tier === 'digital-representative' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => license.manageSubscription()}
          >
            {t('screen.settings.btn_manage_subscription')}
          </Button>
        )}

        <div>
          <p className="settings-page__text settings-page__text--secondary" style={{ marginBottom: 8 }}>
            {license.isPremium ? t('license.enter_different_key') : t('license.have_key')}
          </p>
          <LicenseActivation
            onActivate={license.activateKey}
            alreadyActive={false}
          />
        </div>
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const license = useLicense();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(state.userName || '');
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [addingAccount, setAddingAccount] = useState<'email' | 'calendar' | null>(null);
  const [presets, setPresets] = useState<Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl: string | null; notes: string | null }>>({});
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<'builtin' | 'ollama' | 'custom'>('builtin');
  const [hardwareInfo, setHardwareInfo] = useState<HardwareDisplayInfo | null>(null);
  const [searchProvider, setSearchProvider] = useState<'brave' | 'searxng'>('brave');
  const [braveApiKey, setBraveApiKey] = useState('');
  const [searxngUrl, setSearxngUrl] = useState('');
  const [searchRateLimit, setSearchRateLimit] = useState(60);
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'no_peer' | 'error'>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [styleProfile, setStyleProfile] = useState<StyleProfileResult | null>(null);
  const [voiceModels, setVoiceModels] = useState<VoiceModelStatus | null>(null);
  const [voiceDownloading, setVoiceDownloading] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryData[]>([]);
  const [modelDownloads, setModelDownloads] = useState<ModelDownloadState[]>([]);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await getAccountsStatus();
      setAccounts(result);
    } catch {
      // Gateway not ready yet
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    getProviderPresets()
      .then(setPresets)
      .catch(() => {});
    detectHardware()
      .then((hw) => setHardwareInfo(hw as unknown as HardwareDisplayInfo))
      .catch(() => {});
    getAlterEgoSettings()
      .then((s) => dispatch({ type: 'SET_ALTER_EGO_SETTINGS', settings: s }))
      .catch(() => {});
    getStyleProfile()
      .then(setStyleProfile)
      .catch(() => {});
    getVoiceModelStatus()
      .then(setVoiceModels)
      .catch(() => {});
    getImportHistory()
      .then((d) => setImportHistory(d ?? []))
      .catch(() => {});
    getModelDownloadStatus()
      .then((d) => setModelDownloads(d ?? []))
      .catch(() => {});
  }, [loadAccounts, dispatch]);

  const handleSaveName = useCallback(async () => {
    if (nameValue.trim()) {
      dispatch({ type: 'SET_USER_NAME', name: nameValue.trim() });
      await setUserName(nameValue.trim()).catch(() => {});
      setEditingName(false);
    }
  }, [nameValue, dispatch]);

  const handleAutonomyChange = useCallback(async (tier: AutonomyTier) => {
    // Apply to default for all domains
    const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
    for (const domain of domains) {
      dispatch({ type: 'SET_AUTONOMY_TIER', domain, tier });
      await setAutonomyTier(domain, tier).catch(() => {});
    }
  }, [dispatch]);

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    dispatch({ type: 'SET_THEME', theme: mode });
  }, [dispatch]);

  const handleAddCredential = useCallback(async (credentials: CredentialFormData[]) => {
    for (const cred of credentials) {
      await addCredential({
        serviceType: cred.serviceType,
        protocol: cred.protocol,
        host: cred.host,
        port: cred.port,
        username: cred.username,
        password: cred.password,
        useTls: cred.useTLS,
        displayName: cred.displayName,
      });
    }
    setAddingAccount(null);
    await loadAccounts();
  }, [loadAccounts]);

  const handleTestCredential = useCallback(async (cred: CredentialFormData): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await testCredential({
        serviceType: cred.serviceType,
        protocol: cred.protocol,
        host: cred.host,
        port: cred.port,
        username: cred.username,
        password: cred.password,
        useTls: cred.useTLS,
      });
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const handleRemoveAccount = useCallback(async (username: string, serviceType: string) => {
    setRemovingAccountId(`${serviceType}:${username}`);
    try {
      // Get all credentials for this user/type and remove them
      const allCreds = await listCredentials();
      for (const cred of allCreds) {
        if (cred.username === username && cred.serviceType === serviceType) {
          await removeCredential(cred.id);
        }
      }
      await loadAccounts();
    } finally {
      setRemovingAccountId(null);
    }
  }, [loadAccounts]);

  const handleSaveSearchSettings = useCallback(async () => {
    if (searchProvider === 'brave' && braveApiKey) {
      // Test the API key
      setApiKeyStatus('testing');
      try {
        const result = await testBraveApiKey(braveApiKey);
        if (result.success) {
          setApiKeyStatus('valid');
          setApiKeySaved(true);
          await saveSearchSettings({
            provider: searchProvider,
            braveApiKey,
            searxngUrl: searxngUrl || null,
            rateLimit: searchRateLimit,
          }).catch(() => {});
        } else {
          setApiKeyStatus('invalid');
        }
      } catch {
        setApiKeyStatus('invalid');
      }
    } else {
      await saveSearchSettings({
        provider: searchProvider,
        braveApiKey: braveApiKey || null,
        searxngUrl: searxngUrl || null,
        rateLimit: searchRateLimit,
      }).catch(() => {});
      setApiKeySaved(true);
    }
  }, [searchProvider, braveApiKey, searxngUrl, searchRateLimit]);

  // Load saved search settings on mount
  useEffect(() => {
    getSearchSettings()
      .then((settings) => {
        setSearchProvider(settings.provider as 'brave' | 'searxng');
        if (settings.braveApiKeySet) {
          setBraveApiKey('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'); // Masked
          setApiKeySaved(true);
        }
        if (settings.searxngUrl) setSearxngUrl(settings.searxngUrl);
        if (settings.rateLimit) setSearchRateLimit(settings.rateLimit);
      })
      .catch(() => {});
  }, []);

  const handleTriggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await triggerSync();
      if (result.status === 'no_peer_found') {
        setSyncStatus('no_peer');
      } else if (result.status === 'error') {
        setSyncStatus('error');
      } else {
        setSyncStatus('success');
        setLastSynced(new Date().toISOString());
      }
    } catch {
      setSyncStatus('error');
    }
    // Reset status after 3 seconds
    setTimeout(() => setSyncStatus('idle'), 3000);
  }, []);

  const defaultTier = (state.autonomyConfig['email'] || 'partner') as AutonomyTier;

  return (
    <div className="settings-page">
      <h1 className="settings-page__title">
        {t('screen.settings.title')}
      </h1>

      {/* Your Semblance */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_your_semblance')}
        </h2>
        {editingName ? (
          <div className="settings-page__hstack--sm">
            <Input
              value={nameValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameValue(e.target.value)}
              placeholder={t('placeholder.enter_name')}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSaveName()}
            />
            <Button onClick={handleSaveName} size="sm">{t('button.save')}</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>{t('button.cancel')}</Button>
          </div>
        ) : (
          <div className="settings-page__hstack">
            <span className="settings-page__text settings-page__text--lg ai-name-shimmer">
              {state.userName || t('screen.settings.not_named_yet')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setEditingName(true); setNameValue(state.userName || ''); }}>
              {t('button.edit')}
            </Button>
          </div>
        )}
      </Card>

      {/* AI Engine */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_ai_engine')}
        </h2>

        {/* Runtime Selection */}
        <div className="settings-page__mb-4">
          <label className="settings-page__label">
            {t('screen.settings.label_runtime')}
          </label>
          <div className="settings-page__hstack--sm">
            {(['builtin', 'ollama', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRuntimeMode(mode)}
                className={`settings-page__option-btn${runtimeMode === mode ? ' settings-page__option-btn--active' : ''}`}
              >
                {t(`screen.settings.runtime_${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Runtime Status */}
        {runtimeMode === 'builtin' && (
          <div className="settings-page__vstack--sm">
            <div className="settings-page__hstack">
              <StatusIndicator status="success" />
              <span className="settings-page__text settings-page__text--secondary settings-page__text--sm">
                {t('screen.settings.builtin_status', { model: state.activeModel || t('screen.settings.models_ready') })}
              </span>
            </div>
            {hardwareInfo && (
              <HardwareProfileDisplay hardware={hardwareInfo} compact />
            )}
          </div>
        )}

        {runtimeMode === 'ollama' && (
          <div className="settings-page__hstack">
            <StatusIndicator status={state.ollamaStatus === 'connected' ? 'success' : 'attention'} />
            <span className="settings-page__text settings-page__text--secondary settings-page__text--sm">
              {state.ollamaStatus === 'connected'
                ? t('screen.settings.ollama_connected', { model: state.activeModel || t('screen.settings.ollama_no_model') })
                : t('screen.settings.ollama_disconnected')}
            </span>
          </div>
        )}

        {runtimeMode === 'custom' && (
          <p className="settings-page__text settings-page__text--tertiary settings-page__text--sm">
            {t('screen.settings.custom_coming')}
          </p>
        )}

        {/* Model Selection (Ollama mode) */}
        {runtimeMode === 'ollama' && state.availableModels.length > 0 && (
          <select
            value={state.activeModel || ''}
            onChange={async (e) => {
              const model = e.target.value;
              dispatch({ type: 'SET_ACTIVE_MODEL', model });
              await selectModel(model).catch(() => {});
            }}
            className="settings-page__select"
          >
            {state.availableModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        )}
      </Card>

      {/* Web Search */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_web_search')}
        </h2>

        {/* Search Provider */}
        <div className="settings-page__mb-4">
          <label className="settings-page__label">
            {t('screen.settings.label_search_provider')}
          </label>
          <div className="settings-page__hstack--sm">
            {(['brave', 'searxng'] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => { setSearchProvider(provider); setApiKeySaved(false); }}
                className={`settings-page__option-btn${searchProvider === provider ? ' settings-page__option-btn--active' : ''}`}
              >
                {provider === 'brave' ? t('screen.settings.provider_brave') : t('screen.settings.provider_searxng')}
              </button>
            ))}
          </div>
        </div>

        {/* Brave API Key */}
        {searchProvider === 'brave' && (
          <div className="settings-page__mb-4">
            <label className="settings-page__label">
              {t('screen.settings.label_brave_api_key')}
            </label>
            <div className="settings-page__hstack--sm">
              <Input
                type="password"
                value={braveApiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setBraveApiKey(e.target.value); setApiKeyStatus('idle'); setApiKeySaved(false); }}
                placeholder={t('placeholder.brave_api_key')}
              />
              {apiKeyStatus === 'valid' && (
                <StatusIndicator status="success" />
              )}
              {apiKeyStatus === 'invalid' && (
                <StatusIndicator status="attention" />
              )}
            </div>
            <p className="settings-page__text settings-page__text--hint">
              {t('screen.settings.brave_api_hint')}
            </p>
          </div>
        )}

        {/* SearXNG URL */}
        {searchProvider === 'searxng' && (
          <div className="settings-page__mb-4">
            <label className="settings-page__label">
              {t('screen.settings.label_searxng_url')}
            </label>
            <Input
              value={searxngUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearxngUrl(e.target.value); setApiKeySaved(false); }}
              placeholder={t('placeholder.searxng_url')}
            />
            <p className="settings-page__text settings-page__text--hint">
              {t('screen.settings.searxng_hint')}
            </p>
          </div>
        )}

        {/* Rate Limit */}
        <div className="settings-page__mb-4">
          <label className="settings-page__label">
            {t('screen.settings.label_rate_limit')}
          </label>
          <Input
            type="number"
            value={String(searchRateLimit)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearchRateLimit(parseInt(e.target.value, 10) || 60); setApiKeySaved(false); }}
            min={1}
            max={120}
          />
        </div>

        {/* Save Button */}
        <div className="settings-page__hstack">
          <Button size="sm" onClick={handleSaveSearchSettings} disabled={apiKeyStatus === 'testing'}>
            {apiKeyStatus === 'testing' ? t('status.testing') : t('button.save')}
          </Button>
          {apiKeySaved && (
            <span className="settings-page__text settings-page__text--success">{t('screen.settings.settings_saved')}</span>
          )}
        </div>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_accounts')}
        </h2>

        {accounts.length > 0 ? (
          <div className="settings-page__vstack--sm settings-page__mb-4">
            {accounts.map((account) => (
              <div
                key={`${account.serviceType}:${account.username}`}
                className="settings-page__account-row"
              >
                <StatusIndicator status={account.connected ? 'success' : 'attention'} />
                <div className="settings-page__account-info">
                  <p className="settings-page__account-name">
                    {account.displayName}
                  </p>
                  <p className="settings-page__account-meta">
                    {account.username} — {account.serviceType} ({account.protocols.join(', ')})
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveAccount(account.username, account.serviceType)}
                  disabled={removingAccountId === `${account.serviceType}:${account.username}`}
                >
                  {removingAccountId === `${account.serviceType}:${account.username}` ? t('status.removing') : t('button.remove')}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-page__text settings-page__text--tertiary settings-page__text--sm settings-page__mb-4">{t('screen.settings.empty_accounts')}</p>
        )}

        {addingAccount ? (
          <div className="settings-page__form-section">
            <h3 className="settings-page__form-title">
              {t('screen.settings.add_account_title', { type: addingAccount === 'email' ? t('screen.settings.account_type_email') : t('screen.settings.account_type_calendar') })}
            </h3>
            <CredentialForm
              serviceType={addingAccount}
              presets={presets}
              onSave={handleAddCredential}
              onTest={handleTestCredential}
              onCancel={() => setAddingAccount(null)}
            />
          </div>
        ) : (
          <div className="settings-page__hstack--sm">
            <Button variant="ghost" size="sm" onClick={() => setAddingAccount('email')}>
              {t('screen.settings.btn_add_email')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddingAccount('calendar')}>
              {t('screen.settings.btn_add_calendar')}
            </Button>
          </div>
        )}
      </Card>

      {/* Clipboard Intelligence */}
      <ClipboardSettingsSection />

      {/* Location Services */}
      <LocationSettingsSection />

      {/* Voice Interaction */}
      <VoiceSettingsSection />

      {/* Sound Effects */}
      <SoundSettingsSection />

      {/* Cloud Storage */}
      <CloudStorageSettingsSection />

      {/* Devices & Sync */}
      <Card>
        <h2 className="settings-page__section-title">
          Devices & Sync
        </h2>
        <div className="settings-page__vstack">
          <div className="settings-page__hstack--between">
            <div>
              <p className="settings-page__text settings-page__text--sm">
                Connected Devices
              </p>
              <p className="settings-page__text settings-page__text--secondary">
                No devices on network
              </p>
            </div>
            <button
              onClick={handleTriggerSync}
              disabled={syncStatus === 'syncing'}
              className="settings-page__sync-btn"
            >
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
          {syncStatus === 'success' && (
            <p className="settings-page__text settings-page__text--success">Synced successfully</p>
          )}
          {syncStatus === 'no_peer' && (
            <p className="settings-page__text settings-page__text--caution">No devices found on this network</p>
          )}
          {syncStatus === 'error' && (
            <p className="settings-page__text settings-page__text--critical">Sync failed — check that both devices are on the same network</p>
          )}
          <p className="settings-page__text settings-page__text--secondary">
            {lastSynced ? `Last synced: ${new Date(lastSynced).toLocaleString()}` : 'Last synced: Never'}
          </p>
          <p className="settings-page__text settings-page__text--tertiary">
            Sync includes: preferences, action trail, style profile, knowledge graph
          </p>
        </div>
      </Card>

      {/* Autonomy */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_autonomy')}
        </h2>
        <AutonomySelector value={defaultTier} onChange={handleAutonomyChange} />
      </Card>

      {/* Alter Ego Settings — only visible when tier is alter_ego */}
      {defaultTier === 'alter_ego' && (
        <SettingsAlterEgo
          dollarThreshold={state.alterEgoSettings.dollarThreshold}
          confirmationDisabledCategories={state.alterEgoSettings.confirmationDisabledCategories}
          onChange={async (field, value) => {
            const updated = { ...state.alterEgoSettings, [field]: value };
            dispatch({ type: 'SET_ALTER_EGO_SETTINGS', settings: updated });
            await updateAlterEgoSettings(updated).catch(() => {});
          }}
          onBack={() => {}}
        />
      )}

      {/* Style Profile */}
      <Card>
        <h2 className="settings-page__section-title">
          Writing Style
        </h2>
        <div className="settings-page__vstack">
          <StyleMatchIndicator
            score={styleProfile?.score ?? null}
            emailsAnalyzed={styleProfile?.emailsAnalyzed}
            activationThreshold={20}
          />
          {styleProfile && (
            <StyleProfileCard
              profile={styleProfile}
              onReanalyze={async () => {
                await reanalyzeStyle().catch(() => {});
                const updated = await getStyleProfile().catch(() => null);
                if (updated) setStyleProfile(updated);
              }}
              onReset={async () => {
                await resetStyleProfile().catch(() => {});
                setStyleProfile(null);
              }}
            />
          )}
        </div>
      </Card>

      {/* Voice Models */}
      {voiceModels && !(voiceModels.whisperDownloaded && voiceModels.piperDownloaded) && (
        <VoiceOnboardingCard
          whisperDownloaded={voiceModels.whisperDownloaded}
          piperDownloaded={voiceModels.piperDownloaded}
          whisperSizeMb={voiceModels.whisperSizeMb}
          piperSizeMb={voiceModels.piperSizeMb}
          onDownloadWhisper={async () => {
            setVoiceDownloading(true);
            await downloadVoiceModel('whisper').catch(() => {});
            const updated = await getVoiceModelStatus().catch(() => null);
            if (updated) setVoiceModels(updated);
            setVoiceDownloading(false);
          }}
          onDownloadPiper={async () => {
            setVoiceDownloading(true);
            await downloadVoiceModel('piper').catch(() => {});
            const updated = await getVoiceModelStatus().catch(() => null);
            if (updated) setVoiceModels(updated);
            setVoiceDownloading(false);
          }}
          downloading={voiceDownloading}
        />
      )}

      {/* Model Downloads */}
      {modelDownloads && modelDownloads.length > 0 && (
        <Card>
          <h2 className="settings-page__section-title">
            Model Downloads
          </h2>
          <ModelDownloadProgress
            downloads={modelDownloads}
            onRetry={async (modelName) => {
              await retryModelDownload(modelName).catch(() => {});
              const updated = await getModelDownloadStatus().catch(() => []);
              setModelDownloads(updated ?? []);
            }}
          />
        </Card>
      )}

      {/* Import Digital Life */}
      <Card>
        <h2 className="settings-page__section-title">
          Import Digital Life
        </h2>
        <ImportDigitalLifeView
          isPremium={license.isPremium}
          importHistory={importHistory}
          onImport={async (sourceId) => {
            await startImport(sourceId).catch(() => {});
            const updated = await getImportHistory().catch(() => []);
            setImportHistory(updated);
          }}
        />
      </Card>

      {/* Appearance */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_appearance')}
        </h2>
        <ThemeToggle value={state.theme} onChange={handleThemeChange} />
      </Card>

      {/* License */}
      <LicenseSection />

      {/* About */}
      <Card>
        <h2 className="settings-page__section-title">
          {t('screen.settings.section_about')}
        </h2>
        <div className="settings-page__vstack--xs settings-page__text settings-page__text--secondary settings-page__text--sm">
          <p>{t('screen.settings.about_version')}</p>
          <p>{t('screen.settings.about_license')}</p>
        </div>
      </Card>
    </div>
  );
}
