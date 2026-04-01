// Cloud Bridge Settings Screen — Opt-in cloud AI routing configuration.
//
// Off by default. Users can connect their own API keys for Anthropic, OpenAI,
// Google, or any OpenAI-compatible endpoint. When enabled, the coordinator
// routes complex tasks through the Gateway to the user's cloud subscription.
//
// Key privacy principle: VERIDIAN SYNTHETICS never sees, proxies, or caches
// Cloud Bridge traffic. The user's device connects directly to their provider.

import React, { useState, useEffect, useCallback } from 'react';
import {
  cloudBridgeGetProviders,
  cloudBridgeAddProvider,
  cloudBridgeRemoveProvider,
  cloudBridgeValidateKey,
  cloudBridgeGetPolicy,
  cloudBridgeSetPolicy,
  cloudBridgeGetUsage,
} from '../ipc/commands';
import type { CloudBridgeProviderIPC, CloudBridgePolicyIPC } from '../ipc/commands';

const KNOWN_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', placeholder: 'Your Anthropic API key' },
  { id: 'openai', name: 'OpenAI', placeholder: 'Your OpenAI API key' },
  { id: 'google', name: 'Google AI (Gemini)', placeholder: 'Your Google AI API key' },
  { id: 'custom', name: 'OpenAI-Compatible Endpoint', placeholder: 'API key' },
];

const ROUTING_MODES = [
  { value: 'off', label: 'Off', description: 'All inference runs locally. No data leaves your device.' },
  { value: 'manual', label: 'Manual', description: 'Route to cloud only when you explicitly request it.' },
  { value: 'smart', label: 'Smart', description: 'Automatically route complex tasks to cloud, keep simple tasks local.' },
  { value: 'always', label: 'Always', description: 'All primary reasoning through cloud. Local handles only classification and embedding.' },
] as const;

const DATA_CATEGORIES = [
  { id: 'financial', label: 'Financial data' },
  { id: 'health', label: 'Health records' },
  { id: 'legal', label: 'Legal documents' },
  { id: 'personal_id', label: 'Personal identifiers (SSN, passport)' },
  { id: 'contact_info', label: 'Contact information' },
  { id: 'calendar', label: 'Calendar details' },
];

export function CloudBridgeScreen() {
  const [providers, setProviders] = useState<CloudBridgeProviderIPC[]>([]);
  const [policy, setPolicy] = useState<CloudBridgePolicyIPC | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('anthropic');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [provs, pol] = await Promise.all([
        cloudBridgeGetProviders(),
        cloudBridgeGetPolicy(),
      ]);
      setProviders(provs);
      setPolicy(pol);
    } catch {
      // Cloud Bridge may not be initialized yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddProvider = async () => {
    if (!apiKeyInput.trim()) return;
    setValidating(true);
    setValidationError(null);

    try {
      // Validate the key first
      const validation = await cloudBridgeValidateKey({
        providerId: selectedProviderId,
        apiKey: apiKeyInput,
        baseUrl: selectedProviderId === 'custom' ? customBaseUrl : undefined,
      });

      if (!validation.valid) {
        setValidationError(validation.error ?? 'Invalid API key');
        setValidating(false);
        return;
      }

      // Add the provider
      const result = await cloudBridgeAddProvider({
        providerId: selectedProviderId,
        apiKey: apiKeyInput,
        baseUrl: selectedProviderId === 'custom' ? customBaseUrl : undefined,
      });

      if (result.success) {
        setApiKeyInput('');
        setCustomBaseUrl('');
        setAddingProvider(false);
        await loadData();
      } else {
        setValidationError(result.error ?? 'Failed to add provider');
      }
    } catch (err) {
      setValidationError((err as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    await cloudBridgeRemoveProvider(providerId);
    await loadData();
  };

  const handlePolicyChange = async (updates: Partial<CloudBridgePolicyIPC>) => {
    if (!policy) return;
    const newPolicy = { ...policy, ...updates };
    setPolicy(newPolicy);
    await cloudBridgeSetPolicy(newPolicy);
  };

  const handleCategoryToggle = async (category: string) => {
    if (!policy) return;
    const current = policy.excludedCategories;
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];
    await handlePolicyChange({ excludedCategories: updated });
  };

  if (loading) {
    return <div className="p-6 text-[#8593A4]">Loading Cloud Bridge settings...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-medium text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
          Cloud Bridge
        </h2>
        <p className="text-sm text-[#8593A4] mt-1" style={{ fontFamily: 'DM Mono, monospace' }}>
          Connect your existing AI subscriptions or API keys to amplify Semblance's
          capabilities. When off, all inference runs locally on your device.
        </p>
      </div>

      {/* Routing Mode */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
          Routing Mode
        </h3>
        <div className="space-y-2">
          {ROUTING_MODES.map(mode => (
            <label
              key={mode.value}
              className="flex items-start gap-3 p-3 rounded cursor-pointer hover:bg-[#1a1a2e]/50"
              style={{ backgroundColor: policy?.mode === mode.value ? '#1a1a2e' : 'transparent' }}
            >
              <input
                type="radio"
                name="routing-mode"
                value={mode.value}
                checked={policy?.mode === mode.value}
                onChange={() => handlePolicyChange({ mode: mode.value as CloudBridgePolicyIPC['mode'] })}
                className="mt-1"
              />
              <div>
                <div className="text-sm text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
                  {mode.label}
                </div>
                <div className="text-xs text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>
                  {mode.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Connected Providers */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
            Connected Providers
          </h3>
          <button
            onClick={() => setAddingProvider(true)}
            className="text-xs px-3 py-1 text-[#6ECFA3] border border-[#6ECFA3]/30 rounded hover:bg-[#6ECFA3]/10"
            style={{ fontFamily: 'DM Mono, monospace' }}
          >
            + Add Provider
          </button>
        </div>

        {providers.length === 0 && !addingProvider && (
          <p className="text-sm text-[#8593A4] italic" style={{ fontFamily: 'DM Mono, monospace' }}>
            No providers connected. Add an API key to get started.
          </p>
        )}

        {providers.map(provider => (
          <div
            key={provider.id}
            className="p-4 rounded border border-[#8593A4]/20"
            style={{ backgroundColor: '#0B0E11' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
                  {provider.name}
                </span>
                <span
                  className="ml-2 text-xs px-2 py-0.5 rounded"
                  style={{
                    fontFamily: 'DM Mono, monospace',
                    color: provider.status === 'connected' ? '#6ECFA3' : '#B07A8A',
                    backgroundColor: provider.status === 'connected' ? '#6ECFA3/10' : '#B07A8A/10',
                  }}
                >
                  {provider.status}
                </span>
              </div>
              <button
                onClick={() => handleRemoveProvider(provider.id)}
                className="text-xs text-[#B07A8A] hover:text-[#B07A8A]/80"
                style={{ fontFamily: 'DM Mono, monospace' }}
              >
                Disconnect
              </button>
            </div>
            {provider.usageThisMonth.requests > 0 && (
              <div className="mt-2 text-xs text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>
                This month: {provider.usageThisMonth.requests} requests
                {provider.usageThisMonth.estimatedCost !== null && (
                  <> | ${(provider.usageThisMonth.estimatedCost / 100).toFixed(2)}</>
                )}
              </div>
            )}
            {provider.errorMessage && (
              <div className="mt-1 text-xs text-[#B07A8A]" style={{ fontFamily: 'DM Mono, monospace' }}>
                {provider.errorMessage}
              </div>
            )}
          </div>
        ))}

        {/* Add Provider Form */}
        {addingProvider && (
          <div className="p-4 rounded border border-[#6ECFA3]/30 space-y-3" style={{ backgroundColor: '#0B0E11' }}>
            <select
              value={selectedProviderId}
              onChange={e => setSelectedProviderId(e.target.value)}
              className="w-full p-2 text-sm bg-[#0B0E11] text-[#e8e3e3] border border-[#8593A4]/30 rounded"
              style={{ fontFamily: 'DM Mono, monospace' }}
            >
              {KNOWN_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {selectedProviderId === 'custom' && (
              <input
                type="text"
                placeholder="Base URL (e.g., https://my-server:8080)"
                value={customBaseUrl}
                onChange={e => setCustomBaseUrl(e.target.value)}
                className="w-full p-2 text-sm bg-[#0B0E11] text-[#e8e3e3] border border-[#8593A4]/30 rounded"
                style={{ fontFamily: 'DM Mono, monospace' }}
              />
            )}

            <input
              type="password"
              placeholder={KNOWN_PROVIDERS.find(p => p.id === selectedProviderId)?.placeholder ?? 'API key'}
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              className="w-full p-2 text-sm bg-[#0B0E11] text-[#e8e3e3] border border-[#8593A4]/30 rounded"
              style={{ fontFamily: 'DM Mono, monospace' }}
            />

            {validationError && (
              <p className="text-xs text-[#B07A8A]" style={{ fontFamily: 'DM Mono, monospace' }}>
                {validationError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAddProvider}
                disabled={validating || !apiKeyInput.trim()}
                className="px-4 py-2 text-xs bg-[#6ECFA3] text-[#0B0E11] rounded disabled:opacity-50"
                style={{ fontFamily: 'DM Mono, monospace' }}
              >
                {validating ? 'Validating...' : 'Connect'}
              </button>
              <button
                onClick={() => { setAddingProvider(false); setValidationError(null); }}
                className="px-4 py-2 text-xs text-[#8593A4] border border-[#8593A4]/30 rounded"
                style={{ fontFamily: 'DM Mono, monospace' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Controls */}
      {policy && policy.mode !== 'off' && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
            Privacy Controls
          </h3>

          <label className="flex items-center gap-3 text-sm text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
            <input
              type="checkbox"
              checked={policy.previewBeforeSend}
              onChange={e => handlePolicyChange({ previewBeforeSend: e.target.checked })}
            />
            Preview prompts before sending to cloud
          </label>

          <div className="space-y-1">
            <p className="text-xs text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>
              Never send these data categories to cloud providers:
            </p>
            {DATA_CATEGORIES.map(cat => (
              <label
                key={cat.id}
                className="flex items-center gap-2 text-sm text-[#e8e3e3] pl-2"
                style={{ fontFamily: 'DM Mono, monospace' }}
              >
                <input
                  type="checkbox"
                  checked={policy.excludedCategories.includes(cat.id)}
                  onChange={() => handleCategoryToggle(cat.id)}
                />
                {cat.label}
              </label>
            ))}
          </div>

          {/* Spending Cap */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-sm text-[#e8e3e3]" style={{ fontFamily: 'DM Mono, monospace' }}>
              <input
                type="checkbox"
                checked={policy.spendingCap.enabled}
                onChange={e => handlePolicyChange({
                  spendingCap: { ...policy.spendingCap, enabled: e.target.checked },
                })}
              />
              Monthly spending cap (API keys)
            </label>
            {policy.spendingCap.enabled && (
              <div className="flex items-center gap-2 pl-8">
                <span className="text-sm text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>$</span>
                <input
                  type="number"
                  value={(policy.spendingCap.monthlyLimit / 100).toFixed(2)}
                  onChange={e => handlePolicyChange({
                    spendingCap: {
                      ...policy.spendingCap,
                      monthlyLimit: Math.round(parseFloat(e.target.value) * 100),
                    },
                  })}
                  className="w-24 p-1 text-sm bg-[#0B0E11] text-[#e8e3e3] border border-[#8593A4]/30 rounded"
                  style={{ fontFamily: 'DM Mono, monospace' }}
                  min="0"
                  step="5"
                />
                <span className="text-xs text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>
                  / month (current: ${(policy.spendingCap.currentSpend / 100).toFixed(2)})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sovereignty Note */}
      <div className="p-3 rounded border border-[#6ECFA3]/20 text-xs text-[#8593A4]" style={{ fontFamily: 'DM Mono, monospace' }}>
        {policy?.mode === 'off' ? (
          <>Zero data transmitted to any cloud AI provider. All inference performed locally.</>
        ) : (
          <>
            Cloud Bridge connects your device directly to your cloud provider.
            VERIDIAN SYNTHETICS never sees, proxies, or caches Cloud Bridge traffic.
            All calls are logged to your local audit trail and visible in the Network Monitor.
          </>
        )}
      </div>
    </div>
  );
}
