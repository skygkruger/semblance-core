// Cloud Bridge Settings Screen — Opt-in cloud AI routing configuration.
// @i18n-pending — i18n translation keys will be added in the localization pass
//
// Off by default. Users can connect their own API keys for Anthropic, OpenAI,
// Google, or any OpenAI-compatible endpoint. When enabled, the coordinator
// routes complex tasks through the Gateway to the user's cloud subscription.
//
// Key privacy principle: VERIDIAN SYNTHETICS never sees, proxies, or caches
// Cloud Bridge traffic. The user's device connects directly to their provider.

import { useState, useEffect, useCallback } from 'react';
import { SkeletonCard } from '@semblance/ui';
import {
  cloudBridgeGetProviders,
  cloudBridgeAddProvider,
  cloudBridgeRemoveProvider,
  cloudBridgeValidateKey,
  cloudBridgeGetPolicy,
  cloudBridgeSetPolicy,
} from '../ipc/commands';
import type { CloudBridgeProviderIPC, CloudBridgePolicyIPC } from '../ipc/commands';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import './CloudBridgeScreen.css';

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
      setProviders(Array.isArray(provs) ? provs : []);
      // Sidecar stubs may return [] instead of a policy object — guard against that
      setPolicy(pol && typeof pol === 'object' && !Array.isArray(pol) && 'mode' in pol ? pol : null);
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
    const base = policy ?? { mode: 'off' as const, domainRules: {}, previewBeforeSend: false, excludedCategories: [], spendingCap: { enabled: false, monthlyLimit: 0, currentSpend: 0 } };
    const newPolicy = { ...base, ...updates };
    setPolicy(newPolicy);
    await cloudBridgeSetPolicy(newPolicy).catch(() => {});
  };

  const handleCategoryToggle = async (category: string) => {
    const current = (policy ?? { excludedCategories: [] as string[] }).excludedCategories;
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category];
    await handlePolicyChange({ excludedCategories: updated });
  };

  // Default policy for dev mode (stubs return null)
  const effectivePolicy: CloudBridgePolicyIPC = policy ?? {
    mode: 'off',
    domainRules: {},
    previewBeforeSend: false,
    excludedCategories: [],
    spendingCap: { enabled: false, monthlyLimit: 0, currentSpend: 0 },
  };

  const connectedCount = providers.filter(p => p.status === 'connected').length;
  const routingMode = effectivePolicy.mode;
  const isActive = routingMode !== 'off' && connectedCount > 0;

  if (loading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <h1 className="page-title" style={{ fontSize: 28 }}>Cloud Bridge</h1>
          <SkeletonCard variant="generic" message="Loading Cloud Bridge" subMessage="Retrieving provider configuration" showSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Cloud Bridge amplifies your local AI with your own cloud subscriptions. VERIDIAN never sees the traffic.">
        <h1 className="page-title cloud-bridge__title" style={{ fontSize: 28 }}>Cloud Bridge</h1>
        <div className="cloud-bridge__shimmer-desc">Connect your cloud AI subscriptions to amplify local intelligence</div>

          <div className="surface-cloud" style={{ padding: 24, borderRadius: 12, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* ─── Routing Mode ─── */}
            <FeatureStatusBanner
              title="Routing Mode"
              statusLabel={routingMode.toUpperCase()}
              status={isActive ? 'active' : routingMode === 'off' ? 'error' : 'waiting'}
            />
            <div className="cloud-bridge__routing-options">
              {ROUTING_MODES.map(mode => (
                <label
                  key={mode.value}
                  className={`cloud-bridge__routing-option${effectivePolicy.mode === mode.value ? ' cloud-bridge__routing-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="routing-mode"
                    value={mode.value}
                    checked={effectivePolicy.mode === mode.value}
                    onChange={() => handlePolicyChange({ mode: mode.value as CloudBridgePolicyIPC['mode'] })}
                    className="cloud-bridge__routing-radio"
                    style={{ accentColor: '#38BDF8' }}
                  />
                  <div>
                    <div className="cloud-bridge__routing-label">{mode.label}</div>
                    <div className="cloud-bridge__routing-desc">{mode.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <SectionDivider />

            {/* ─── Connected Providers ─── */}
            <FeatureStatusBanner
              title="Connected Providers"
              statusLabel={connectedCount > 0 ? `${connectedCount} CONNECTED` : 'NONE'}
              status={connectedCount > 0 ? 'active' : 'error'}
            />

            {providers.length === 0 && !addingProvider ? (
              <EmptyFeatureState
                message="No cloud providers connected. Add an API key to amplify your local intelligence."
                actionLabel="Add Provider"
                onAction={() => setAddingProvider(true)}
              />
            ) : (
              <div className="cloud-bridge__providers-list">
                {providers.map(provider => (
                  <div key={provider.id} className="cloud-bridge__provider">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="cloud-bridge__provider-name">{provider.name}</span>
                        <span
                          className="cloud-bridge__provider-status"
                          style={{
                            color: provider.status === 'connected' ? '#6ECFA3' : '#E8657A',
                          }}
                        >
                          {provider.status}
                        </span>
                      </div>
                      {provider.usageThisMonth.requests > 0 && (
                        <div className="cloud-bridge__provider-usage">
                          This month: {provider.usageThisMonth.requests} requests
                          {provider.usageThisMonth.estimatedCost !== null && (
                            <> | ${(provider.usageThisMonth.estimatedCost / 100).toFixed(2)}</>
                          )}
                        </div>
                      )}
                      {provider.errorMessage && (
                        <div className="cloud-bridge__provider-error">{provider.errorMessage}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleRemoveProvider(provider.id)}
                    >
                      <span className="btn__text">Disconnect</span>
                    </button>
                  </div>
                ))}

                {!addingProvider && (
                  <button
                    type="button"
                    className="btn btn--opal btn--sm"
                    onClick={() => setAddingProvider(true)}
                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  >
                    <span className="btn__text">+ Add Provider</span>
                  </button>
                )}
              </div>
            )}

            {/* ─── Add Provider Form ─── */}
            {addingProvider && (
              <div className="cloud-bridge__add-form">
                <select
                  value={selectedProviderId}
                  onChange={e => setSelectedProviderId(e.target.value)}
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
                  />
                )}

                <input
                  type="password"
                  placeholder={KNOWN_PROVIDERS.find(p => p.id === selectedProviderId)?.placeholder ?? 'API key'}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                />

                {validationError && (
                  <span className="cloud-bridge__validation-error">{validationError}</span>
                )}

                <div className="cloud-bridge__add-form-actions">
                  <button
                    type="button"
                    className="btn btn--opal btn--sm"
                    onClick={handleAddProvider}
                    disabled={validating || !apiKeyInput.trim()}
                  >
                    <span className="btn__text">{validating ? 'Validating...' : 'Connect'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => { setAddingProvider(false); setValidationError(null); }}
                  >
                    <span className="btn__text">Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {/* ─── Privacy Controls (visible when not off) ─── */}
            {effectivePolicy.mode !== 'off' && (
              <>
                <SectionDivider />

                <FeatureStatusBanner
                  title="Privacy Controls"
                  statusLabel={effectivePolicy.excludedCategories.length > 0 ? `${effectivePolicy.excludedCategories.length} EXCLUDED` : 'NO EXCLUSIONS'}
                  status={effectivePolicy.excludedCategories.length > 0 ? 'active' : 'waiting'}
                />

                <div className="cloud-bridge__privacy-row">
                  <input
                    type="checkbox"
                    checked={effectivePolicy.previewBeforeSend}
                    onChange={e => handlePolicyChange({ previewBeforeSend: e.target.checked })}
                    style={{ accentColor: '#38BDF8' }}
                  />
                  <span className="cloud-bridge__privacy-label">Preview prompts before sending to cloud</span>
                </div>

                <div className="cloud-bridge__category-hint">
                  Never send these data categories to cloud providers:
                </div>
                <div className="cloud-bridge__category-list">
                  {DATA_CATEGORIES.map(cat => (
                    <label key={cat.id} className="cloud-bridge__category-item">
                      <input
                        type="checkbox"
                        checked={effectivePolicy.excludedCategories.includes(cat.id)}
                        onChange={() => handleCategoryToggle(cat.id)}
                      />
                      <span className="cloud-bridge__category-label">{cat.label}</span>
                    </label>
                  ))}
                </div>

                <SectionDivider />

                {/* ─── Spending Cap ─── */}
                <FeatureStatusBanner
                  title="Spending Cap"
                  statusLabel={effectivePolicy.spendingCap.enabled ? `$${(effectivePolicy.spendingCap.monthlyLimit / 100).toFixed(0)}/MO` : 'UNLIMITED'}
                  status={effectivePolicy.spendingCap.enabled ? 'active' : 'waiting'}
                />

                <div className="cloud-bridge__privacy-row">
                  <input
                    type="checkbox"
                    checked={effectivePolicy.spendingCap.enabled}
                    onChange={e => handlePolicyChange({
                      spendingCap: { ...effectivePolicy.spendingCap, enabled: e.target.checked },
                    })}
                    style={{ accentColor: '#38BDF8' }}
                  />
                  <span className="cloud-bridge__privacy-label">Monthly spending cap (API keys)</span>
                </div>
                {effectivePolicy.spendingCap.enabled && (
                  <div className="cloud-bridge__spending-row">
                    <span className="cloud-bridge__spending-label">$</span>
                    <input
                      type="number"
                      value={(effectivePolicy.spendingCap.monthlyLimit / 100).toFixed(2)}
                      onChange={e => handlePolicyChange({
                        spendingCap: {
                          ...effectivePolicy.spendingCap,
                          monthlyLimit: Math.round(parseFloat(e.target.value) * 100),
                        },
                      })}
                      className="cloud-bridge__spending-input"
                      min="0"
                      step="5"
                    />
                    <span className="cloud-bridge__spending-label">
                      / month (current: ${(effectivePolicy.spendingCap.currentSpend / 100).toFixed(2)})
                    </span>
                  </div>
                )}
              </>
            )}

            <SectionDivider />

            {/* ─── Sovereignty Note ─── */}
            <div className="cloud-bridge__sovereignty-note">
              {effectivePolicy.mode === 'off' ? (
                <>Zero data transmitted to any cloud AI provider. All inference performed locally on your device.</>
              ) : (
                <>
                  Cloud Bridge connects your device directly to your cloud provider.
                  VERIDIAN SYNTHETICS never sees, proxies, or caches Cloud Bridge traffic.
                  All calls are logged to your local audit trail and visible in the Network Monitor.
                </>
              )}
            </div>
          </div>

        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
