import { useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, Input, Button, StatusIndicator, AutonomySelector, ThemeToggle, CredentialForm } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import type { AutonomyTier } from '@semblance/ui';
import type { ThemeMode } from '@semblance/ui';
import type { CredentialFormData } from '@semblance/ui';

interface AccountInfo {
  id: string;
  serviceType: string;
  protocol: string;
  host: string;
  port: number;
  username: string;
  displayName: string;
  useTls: boolean;
  createdAt: string;
}

interface AccountStatus {
  serviceType: string;
  displayName: string;
  username: string;
  protocols: string[];
  connected: boolean;
}

export function SettingsScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(state.userName || '');
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [addingAccount, setAddingAccount] = useState<'email' | 'calendar' | null>(null);
  const [presets, setPresets] = useState<Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl: string | null; notes: string | null }>>({});
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [removingAccountId, setRemovingAccountId] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await invoke<AccountStatus[]>('get_accounts_status');
      setAccounts(result);
    } catch {
      // Gateway not ready yet
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    invoke<Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl: string | null; notes: string | null }>>('get_provider_presets')
      .then(setPresets)
      .catch(() => {});
  }, [loadAccounts]);

  const handleSaveName = useCallback(async () => {
    if (nameValue.trim()) {
      dispatch({ type: 'SET_USER_NAME', name: nameValue.trim() });
      await invoke('set_user_name', { name: nameValue.trim() }).catch(() => {});
      setEditingName(false);
    }
  }, [nameValue, dispatch]);

  const handleAutonomyChange = useCallback(async (tier: AutonomyTier) => {
    // Apply to default for all domains
    const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
    for (const domain of domains) {
      dispatch({ type: 'SET_AUTONOMY_TIER', domain, tier });
      await invoke('set_autonomy_tier', { domain, tier }).catch(() => {});
    }
  }, [dispatch]);

  const handleThemeChange = useCallback((mode: ThemeMode) => {
    dispatch({ type: 'SET_THEME', theme: mode });
  }, [dispatch]);

  const handleAddCredential = useCallback(async (credentials: CredentialFormData[]) => {
    for (const cred of credentials) {
      await invoke('add_credential', {
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
      const result = await invoke<{ success: boolean; error?: string }>('test_credential', {
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
      const allCreds = await invoke<AccountInfo[]>('list_credentials');
      for (const cred of allCreds) {
        if (cred.username === username && cred.serviceType === serviceType) {
          await invoke('remove_credential', { id: cred.id });
        }
      }
      await loadAccounts();
    } finally {
      setRemovingAccountId(null);
    }
  }, [loadAccounts]);

  const defaultTier = (state.autonomyConfig['email'] || 'partner') as AutonomyTier;

  return (
    <div className="max-w-container-sm mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        Settings
      </h1>

      {/* Your Semblance */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Your Semblance
        </h2>
        {editingName ? (
          <div className="flex gap-2">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              placeholder="Enter a name"
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            />
            <Button onClick={handleSaveName} size="sm">Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingName(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-semblance-accent">
              {state.userName || 'Not named yet'}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setEditingName(true); setNameValue(state.userName || ''); }}>
              Edit
            </Button>
          </div>
        )}
      </Card>

      {/* AI Model */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          AI Model
        </h2>
        <div className="flex items-center gap-3 mb-4">
          <StatusIndicator status={state.ollamaStatus === 'connected' ? 'success' : 'attention'} />
          <span className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            {state.ollamaStatus === 'connected'
              ? `Connected — ${state.activeModel || 'No model selected'}`
              : 'Ollama not connected. Make sure Ollama is running on this device.'}
          </span>
        </div>
        {state.availableModels.length > 0 && (
          <select
            value={state.activeModel || ''}
            onChange={async (e) => {
              const model = e.target.value;
              dispatch({ type: 'SET_ACTIVE_MODEL', model });
              await invoke('select_model', { modelId: model }).catch(() => {});
            }}
            className="w-full px-4 py-3 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface-1 dark:bg-semblance-surface-1-dark text-semblance-text-primary dark:text-semblance-text-primary-dark focus:outline-none focus:shadow-focus"
          >
            {state.availableModels.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        )}
      </Card>

      {/* Connected Accounts */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Connected Accounts
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
                  {removingAccountId === `${account.serviceType}:${account.username}` ? 'Removing...' : 'Remove'}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-semblance-text-tertiary mb-4">No accounts connected yet.</p>
        )}

        {addingAccount ? (
          <div className="border border-semblance-border dark:border-semblance-border-dark rounded-md p-4">
            <h3 className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
              Add {addingAccount === 'email' ? 'Email' : 'Calendar'} Account
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
            <Button variant="secondary" size="sm" onClick={() => setAddingAccount('email')}>
              Add Email
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setAddingAccount('calendar')}>
              Add Calendar
            </Button>
          </div>
        )}
      </Card>

      {/* Autonomy */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Autonomy
        </h2>
        <AutonomySelector value={defaultTier} onChange={handleAutonomyChange} />
      </Card>

      {/* Appearance */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Appearance
        </h2>
        <ThemeToggle value={state.theme} onChange={handleThemeChange} />
      </Card>

      {/* About */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          About
        </h2>
        <div className="space-y-2 text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
          <p>Semblance v0.1.0 — Sprint 1</p>
          <p>Open Source — MIT License</p>
        </div>
      </Card>
    </div>
  );
}
