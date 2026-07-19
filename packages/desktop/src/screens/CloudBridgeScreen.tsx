// Capabilities — user-controlled execution destination policy and BYO providers.
// @i18n-pending — i18n translation keys will be added in the localization pass

import { useState, useEffect, useCallback } from 'react';
import { SkeletonCard } from '@semblance/ui';
import {
  cloudBridgeGetProviders,
  cloudBridgeAddProvider,
  cloudBridgeRemoveProvider,
  cloudBridgeValidateKey,
  cloudBridgeGetPolicy,
  cloudBridgeSetPolicy,
  executionGetDestinationPolicy,
  executionSetDestinationPolicy,
  executionListReceipts,
} from '../ipc/commands';
import type {
  CloudBridgeProviderIPC,
  CloudBridgePolicyIPC,
  ExecutionDestinationPolicyIPC,
  CapabilityDestinationConfigIPC,
  ExecutionRunReceiptIPC,
  CapabilityDestinationPreference,
  CapabilityModelClass,
} from '../ipc/commands';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';
import { SectionDivider } from '../components/SectionDivider';
import { FeatureStatusBanner } from '../components/FeatureStatusBanner';
import { EmptyFeatureState } from '../components/EmptyFeatureState';
import './CloudBridgeScreen.css';

const COLORS = {
  background: '#0B0E11',
  veridian: '#6ECFA3',
  caution: '#B09A8A',
  critical: '#B07A8A',
  silver: '#8593A4',
  text: '#A8B4C0',
  muted: '#5E6B7C',
};

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

const CAPABILITY_LABELS: Record<string, string> = {
  'chat.reasoning': 'Chat reasoning',
  'chat.summarize': 'Chat summarize',
  'email.triage': 'Email triage',
  'calendar.planning': 'Calendar planning',
};

const DESTINATION_OPTIONS: Array<{ value: CapabilityDestinationPreference; label: string }> = [
  { value: 'local', label: 'Local' },
  { value: 'self_hosted', label: 'Self-hosted' },
  { value: 'byo', label: 'BYO provider' },
  { value: 'ask', label: 'Ask every time' },
];

const MODEL_CLASS_OPTIONS: Array<{ value: CapabilityModelClass; label: string }> = [
  { value: 'fast', label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'reasoning', label: 'Reasoning' },
];

function formatCapabilityLabel(capabilityId: string): string {
  return CAPABILITY_LABELS[capabilityId] ?? capabilityId.replace('.', ' · ');
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString();
}

export function CloudBridgeScreen() {
  const [providers, setProviders] = useState<CloudBridgeProviderIPC[]>([]);
  const [policy, setPolicy] = useState<CloudBridgePolicyIPC | null>(null);
  const [destinationPolicy, setDestinationPolicy] = useState<ExecutionDestinationPolicyIPC | null>(null);
  const [receipts, setReceipts] = useState<ExecutionRunReceiptIPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState(false);
  const [selectedProviderId, setSelectedProviderId] = useState('anthropic');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [provs, pol, destPol, receiptList] = await Promise.all([
        cloudBridgeGetProviders(),
        cloudBridgeGetPolicy(),
        executionGetDestinationPolicy(),
        executionListReceipts(12),
      ]);
      setProviders(Array.isArray(provs) ? provs : []);
      setPolicy(pol && typeof pol === 'object' && !Array.isArray(pol) && 'mode' in pol ? pol : null);
      setDestinationPolicy(destPol && typeof destPol === 'object' ? destPol : null);
      setReceipts(Array.isArray(receiptList?.receipts) ? receiptList.receipts : []);
    } catch {
      // Sidecar may not be initialized yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const persistDestinationPolicy = async (updates: Partial<ExecutionDestinationPolicyIPC>) => {
    const base = destinationPolicy ?? {
      schemaVersion: 1 as const,
      localOnlyKillSwitch: false,
      capabilities: {},
      updatedAt: new Date().toISOString(),
    };
    const nextPolicy = { ...base, ...updates };
    setDestinationPolicy(nextPolicy);
    const saved = await executionSetDestinationPolicy(nextPolicy).catch(() => null);
    if (saved?.policy) {
      setDestinationPolicy(saved.policy);
    }
  };

  const updateCapability = async (
    capabilityId: string,
    updates: Partial<CapabilityDestinationConfigIPC>,
  ) => {
    if (!destinationPolicy) return;
    const current = destinationPolicy.capabilities[capabilityId];
    if (!current) return;
    await persistDestinationPolicy({
      capabilities: {
        ...destinationPolicy.capabilities,
        [capabilityId]: { ...current, ...updates },
      },
    });
  };

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

  const effectivePolicy: CloudBridgePolicyIPC = policy ?? {
    mode: 'off',
    domainRules: {},
    previewBeforeSend: false,
    excludedCategories: [],
    spendingCap: { enabled: false, monthlyLimit: 0, currentSpend: 0 },
  };

  const effectiveDestinationPolicy: ExecutionDestinationPolicyIPC = destinationPolicy ?? {
    schemaVersion: 1,
    localOnlyKillSwitch: false,
    capabilities: {},
    updatedAt: new Date().toISOString(),
  };

  const capabilityEntries = Object.entries(effectiveDestinationPolicy.capabilities);
  const connectedCount = providers.filter(p => p.status === 'connected').length;
  const routingMode = effectivePolicy.mode;
  const isActive = routingMode !== 'off' && connectedCount > 0;
  const killSwitchActive = effectiveDestinationPolicy.localOnlyKillSwitch;

  if (loading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <h1 className="page-title" style={{ fontSize: 28, color: COLORS.text }}>Capabilities</h1>
          <SkeletonCard variant="generic" message="Loading capabilities" subMessage="Retrieving destination policy" showSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="You choose where each capability runs — local, self-hosted, or your own provider. Nothing leaves without your policy.">
        <h1 className="page-title cloud-bridge__title cloud-bridge__title--capabilities" style={{ fontSize: 28 }}>Capabilities</h1>
        <div className="cloud-bridge__shimmer-desc cloud-bridge__shimmer-desc--capabilities">
          Control execution destinations, disclosure ceilings, and proof receipts
        </div>

          <div className="surface-cloud" style={{ padding: 24, borderRadius: 12, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, backgroundColor: COLORS.background }}>
            <FeatureStatusBanner
              title="Local-only kill switch"
              statusLabel={killSwitchActive ? 'ENFORCED' : 'OFF'}
              status={killSwitchActive ? 'active' : 'waiting'}
            />
            <div className="cloud-bridge__privacy-row">
              <input
                type="checkbox"
                checked={effectiveDestinationPolicy.localOnlyKillSwitch}
                onChange={e => persistDestinationPolicy({ localOnlyKillSwitch: e.target.checked })}
                style={{ accentColor: COLORS.veridian }}
              />
              <span className="cloud-bridge__privacy-label">
                Force all execution to stay on this device (blocks remote destinations)
              </span>
            </div>

            <SectionDivider />

            <FeatureStatusBanner
              title="Execution destinations"
              statusLabel={`${capabilityEntries.length} CAPABILITIES`}
              status="active"
            />

            {capabilityEntries.length === 0 ? (
              <EmptyFeatureState
                message="No capability policies loaded yet."
                actionLabel="Reload"
                onAction={() => { setLoading(true); loadData(); }}
              />
            ) : (
              <div className="cloud-bridge__capabilities-list">
                {capabilityEntries.map(([capabilityId, config]) => (
                  <div key={capabilityId} className="cloud-bridge__capability-card">
                    <div className="cloud-bridge__capability-header">
                      <span className="cloud-bridge__capability-name">{formatCapabilityLabel(capabilityId)}</span>
                      <span className="cloud-bridge__capability-id">{capabilityId}</span>
                    </div>

                    <div className="cloud-bridge__capability-grid">
                      <label className="cloud-bridge__capability-field">
                        <span>Destination</span>
                        <select
                          value={config.destinationPreference}
                          onChange={e => updateCapability(capabilityId, {
                            destinationPreference: e.target.value as CapabilityDestinationPreference,
                          })}
                          style={{ accentColor: COLORS.veridian }}
                        >
                          {DESTINATION_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="cloud-bridge__capability-field">
                        <span>Disclosure ceiling</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={config.disclosureCeiling}
                          onChange={e => updateCapability(capabilityId, {
                            disclosureCeiling: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                          })}
                        />
                      </label>

                      <label className="cloud-bridge__capability-field">
                        <span>Model class</span>
                        <select
                          value={config.modelClass}
                          onChange={e => updateCapability(capabilityId, {
                            modelClass: e.target.value as CapabilityModelClass,
                          })}
                        >
                          {MODEL_CLASS_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>

                      <label className="cloud-bridge__capability-field">
                        <span>Budget (¢)</span>
                        <input
                          type="number"
                          min={0}
                          step={50}
                          value={config.budgetCents}
                          onChange={e => updateCapability(capabilityId, {
                            budgetCents: Math.max(0, Number(e.target.value) || 0),
                          })}
                        />
                      </label>

                      <label className="cloud-bridge__capability-field">
                        <span>Latency max (ms)</span>
                        <input
                          type="number"
                          min={1000}
                          step={1000}
                          value={config.latencyMaxMs}
                          onChange={e => updateCapability(capabilityId, {
                            latencyMaxMs: Math.max(1000, Number(e.target.value) || 1000),
                          })}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <SectionDivider />

            <FeatureStatusBanner
              title="Proof receipts"
              statusLabel={receipts.length > 0 ? `${receipts.length} RECENT` : 'NONE'}
              status={receipts.length > 0 ? 'active' : 'waiting'}
            />

            {receipts.length === 0 ? (
              <div className="cloud-bridge__sovereignty-note" style={{ borderColor: 'rgba(110, 207, 163, 0.15)', background: 'rgba(110, 207, 163, 0.03)' }}>
                No broker execution receipts yet. Successful BYO or self-hosted runs appear here with disclosure hashes.
              </div>
            ) : (
              <div className="cloud-bridge__receipts-list">
                {receipts.map(receipt => (
                  <div key={receipt.id} className="cloud-bridge__receipt-card">
                    <div className="cloud-bridge__receipt-row">
                      <span className="cloud-bridge__receipt-capability">{formatCapabilityLabel(receipt.capabilityId)}</span>
                      <span
                        className="cloud-bridge__receipt-status"
                        style={{
                          color: receipt.status === 'success'
                            ? COLORS.veridian
                            : receipt.status === 'ask'
                              ? COLORS.caution
                              : COLORS.critical,
                        }}
                      >
                        {receipt.status.toUpperCase()}
                        {receipt.destination ? ` · ${receipt.destination}` : ''}
                      </span>
                    </div>
                    <div className="cloud-bridge__receipt-meta">
                      {formatTimestamp(receipt.timestamp)} · {receipt.reason}
                    </div>
                    {receipt.disclosureReceipt && (
                      <div className="cloud-bridge__receipt-hash">
                        {receipt.disclosureReceipt.label.toUpperCase()} receipt · prompt {receipt.disclosureReceipt.promptContentHash.slice(0, 12)}…
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <SectionDivider />

            <FeatureStatusBanner
              title="BYO routing mode"
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
                    style={{ accentColor: COLORS.veridian }}
                  />
                  <div>
                    <div className="cloud-bridge__routing-label">{mode.label}</div>
                    <div className="cloud-bridge__routing-desc">{mode.description}</div>
                  </div>
                </label>
              ))}
            </div>

            <SectionDivider />

            <FeatureStatusBanner
              title="Connected providers"
              statusLabel={connectedCount > 0 ? `${connectedCount} CONNECTED` : 'NONE'}
              status={connectedCount > 0 ? 'active' : 'error'}
            />

            {providers.length === 0 && !addingProvider ? (
              <EmptyFeatureState
                message="No BYO providers connected. Add an API key for remote execution when policy allows."
                actionLabel="Add provider"
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
                            color: provider.status === 'connected' ? COLORS.veridian : COLORS.critical,
                          }}
                        >
                          {provider.status}
                        </span>
                      </div>
                      {provider.usageThisMonth.requests > 0 && (
                        <div className="cloud-bridge__provider-usage">
                          This month: {provider.usageThisMonth.requests} requests
                          {provider.usageThisMonth.estimatedCost !== null && (
                            <> · ${(provider.usageThisMonth.estimatedCost / 100).toFixed(2)}</>
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
                    <span className="btn__text">+ Add provider</span>
                  </button>
                )}
              </div>
            )}

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

            {effectivePolicy.mode !== 'off' && (
              <>
                <SectionDivider />

                <FeatureStatusBanner
                  title="Privacy controls"
                  statusLabel={effectivePolicy.excludedCategories.length > 0 ? `${effectivePolicy.excludedCategories.length} EXCLUDED` : 'NO EXCLUSIONS'}
                  status={effectivePolicy.excludedCategories.length > 0 ? 'active' : 'waiting'}
                />

                <div className="cloud-bridge__privacy-row">
                  <input
                    type="checkbox"
                    checked={effectivePolicy.previewBeforeSend}
                    onChange={e => handlePolicyChange({ previewBeforeSend: e.target.checked })}
                    style={{ accentColor: COLORS.veridian }}
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

                <FeatureStatusBanner
                  title="Spending cap"
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
                    style={{ accentColor: COLORS.veridian }}
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

            <div className="cloud-bridge__sovereignty-note" style={{ borderColor: 'rgba(110, 207, 163, 0.15)', background: 'rgba(110, 207, 163, 0.03)' }}>
              {killSwitchActive ? (
                <>Local-only kill switch is active. Remote execution is blocked regardless of capability preference.</>
              ) : effectivePolicy.mode === 'off' ? (
                <>Default path is local execution. Remote destinations require explicit policy and consent.</>
              ) : (
                <>
                  BYO and self-hosted execution use the Cloud Broker and Gateway opaque transport.
                  VERIDIAN never sees provider traffic. Disclosure receipts are stored locally.
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
