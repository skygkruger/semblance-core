import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, Input, Button, StatusIndicator, AutonomySelector, ThemeToggle, CredentialForm, LicenseActivation, FoundingMemberBadge } from '@semblance/ui';
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
} from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';
import { useLicense } from '../contexts/LicenseContext';
import { HardwareProfileDisplay } from '../components/HardwareProfileDisplay';
import { ClipboardSettingsSection } from '../components/ClipboardSettingsSection';
import { LocationSettingsSection } from '../components/LocationSettingsSection';
import { VoiceSettingsSection } from '../components/VoiceSettingsSection';
import { CloudStorageSettingsSection } from '../components/CloudStorageSettingsSection';
import type { HardwareDisplayInfo } from '../components/HardwareProfileDisplay';
import type { AutonomyTier } from '@semblance/ui';
import type { ThemeMode } from '@semblance/ui';
import type { CredentialFormData } from '@semblance/ui';
import type { AccountInfo, AccountStatus } from '../ipc/types';

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
      <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
        {t('screen.settings.section_license')}
      </h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark font-medium">
              {tierLabel}
            </p>
            <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
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
          <p className="text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark mb-2">
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
  }, [loadAccounts]);

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

  const defaultTier = (state.autonomyConfig['email'] || 'partner') as AutonomyTier;

  return (
    <div className="max-w-container-sm mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        {t('screen.settings.title')}
      </h1>

      {/* Your Semblance */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_your_semblance')}
        </h2>
        {editingName ? (
          <div className="flex gap-2">
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
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-semblance-accent">
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
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_ai_engine')}
        </h2>

        {/* Runtime Selection */}
        <div className="mb-4">
          <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
            {t('screen.settings.label_runtime')}
          </label>
          <div className="flex gap-2">
            {(['builtin', 'ollama', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRuntimeMode(mode)}
                className={`px-4 py-2 text-sm rounded-md border transition-colors duration-fast ${
                  runtimeMode === mode
                    ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary font-medium'
                    : 'border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:border-semblance-primary/50'
                }`}
              >
                {t(`screen.settings.runtime_${mode}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Runtime Status */}
        {runtimeMode === 'builtin' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusIndicator status="success" />
              <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                {t('screen.settings.builtin_status', { model: state.activeModel || t('screen.settings.models_ready') })}
              </span>
            </div>
            {hardwareInfo && (
              <HardwareProfileDisplay hardware={hardwareInfo} compact />
            )}
          </div>
        )}

        {runtimeMode === 'ollama' && (
          <div className="flex items-center gap-3">
            <StatusIndicator status={state.ollamaStatus === 'connected' ? 'success' : 'attention'} />
            <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {state.ollamaStatus === 'connected'
                ? t('screen.settings.ollama_connected', { model: state.activeModel || t('screen.settings.ollama_no_model') })
                : t('screen.settings.ollama_disconnected')}
            </span>
          </div>
        )}

        {runtimeMode === 'custom' && (
          <p className="text-sm text-semblance-text-tertiary">
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
            className="w-full mt-3 px-4 py-3 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
          >
            {state.availableModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        )}
      </Card>

      {/* Web Search */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_web_search')}
        </h2>

        {/* Search Provider */}
        <div className="mb-4">
          <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
            {t('screen.settings.label_search_provider')}
          </label>
          <div className="flex gap-2">
            {(['brave', 'searxng'] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => { setSearchProvider(provider); setApiKeySaved(false); }}
                className={`px-4 py-2 text-sm rounded-md border transition-colors duration-fast ${
                  searchProvider === provider
                    ? 'border-semblance-primary bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary font-medium'
                    : 'border-semblance-border dark:border-semblance-border-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:border-semblance-primary/50'
                }`}
              >
                {provider === 'brave' ? t('screen.settings.provider_brave') : t('screen.settings.provider_searxng')}
              </button>
            ))}
          </div>
        </div>

        {/* Brave API Key */}
        {searchProvider === 'brave' && (
          <div className="mb-4">
            <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
              {t('screen.settings.label_brave_api_key')}
            </label>
            <div className="flex gap-2">
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
            <p className="text-xs text-semblance-text-tertiary mt-1">
              {t('screen.settings.brave_api_hint')}
            </p>
          </div>
        )}

        {/* SearXNG URL */}
        {searchProvider === 'searxng' && (
          <div className="mb-4">
            <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
              {t('screen.settings.label_searxng_url')}
            </label>
            <Input
              value={searxngUrl}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setSearxngUrl(e.target.value); setApiKeySaved(false); }}
              placeholder={t('placeholder.searxng_url')}
            />
            <p className="text-xs text-semblance-text-tertiary mt-1">
              {t('screen.settings.searxng_hint')}
            </p>
          </div>
        )}

        {/* Rate Limit */}
        <div className="mb-4">
          <label className="text-xs font-medium text-semblance-text-tertiary uppercase tracking-wider mb-2 block">
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
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={handleSaveSearchSettings} disabled={apiKeyStatus === 'testing'}>
            {apiKeyStatus === 'testing' ? t('status.testing') : t('button.save')}
          </Button>
          {apiKeySaved && (
            <span className="text-xs text-semblance-success">{t('screen.settings.settings_saved')}</span>
          )}
        </div>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_accounts')}
        </h2>

        {accounts.length > 0 ? (
          <div className="space-y-3 mb-4">
            {accounts.map((account) => (
              <div
                key={`${account.serviceType}:${account.username}`}
                className="flex items-center gap-3 p-3 rounded-md bg-semblance-surface-1 dark:bg-semblance-surface-1-dark"
              >
                <StatusIndicator status={account.connected ? 'success' : 'attention'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark truncate">
                    {account.displayName}
                  </p>
                  <p className="text-xs text-semblance-text-tertiary truncate">
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
          <p className="text-sm text-semblance-text-tertiary mb-4">{t('screen.settings.empty_accounts')}</p>
        )}

        {addingAccount ? (
          <div className="border border-semblance-border dark:border-semblance-border-dark rounded-md p-4">
            <h3 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
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
          <div className="flex gap-2">
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

      {/* Cloud Storage */}
      <CloudStorageSettingsSection />

      {/* Autonomy */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_autonomy')}
        </h2>
        <AutonomySelector value={defaultTier} onChange={handleAutonomyChange} />
      </Card>

      {/* Appearance */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_appearance')}
        </h2>
        <ThemeToggle value={state.theme} onChange={handleThemeChange} />
      </Card>

      {/* License */}
      <LicenseSection />

      {/* About */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          {t('screen.settings.section_about')}
        </h2>
        <div className="space-y-2 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          <p>{t('screen.settings.about_version')}</p>
          <p>{t('screen.settings.about_license')}</p>
        </div>
      </Card>
    </div>
  );
}
