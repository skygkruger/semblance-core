import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, Input, Button, StatusIndicator, AutonomySelector, ThemeToggle } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import type { AutonomyTier } from '@semblance/ui';
import type { ThemeMode } from '@semblance/ui';

export function SettingsScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(state.userName || '');

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
