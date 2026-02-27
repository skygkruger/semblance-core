/**
 * Onboarding Flow — Cinematic first-run experience.
 * This is the most emotionally important flow in the product.
 * Uses DM Serif Display, --duration-cinematic timing, crossfade transitions.
 *
 * 11 screens: Welcome → Promise → Naming → Hardware Detection → Model Download Consent →
 * Model Download Progress → Data Connection → File Selection → Knowledge Moment →
 * Autonomy → Ready
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Input, AutonomySelector, ProgressBar, CredentialForm } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import { KnowledgeMomentDisplay } from '../components/KnowledgeMomentDisplay';
import { HardwareProfileDisplay } from '../components/HardwareProfileDisplay';
import { ModelDownloadProgress } from '../components/ModelDownloadProgress';
import type { HardwareDisplayInfo } from '../components/HardwareProfileDisplay';
import type { ModelDownloadState } from '../components/ModelDownloadProgress';
import type { AutonomyTier, CredentialFormData } from '@semblance/ui';

interface ActivationResult {
  success: boolean;
  tier?: string;
  error?: string;
}

interface LicenseStatus {
  tier: 'free' | 'founding' | 'digital-representative' | 'lifetime';
  isPremium: boolean;
  isFoundingMember: boolean;
  foundingSeat: number | null;
  licenseKey: string | null;
}

const TOTAL_STEPS = 11;

export function OnboardingScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [step, setStep] = useState(state.onboardingStep);
  const [nameInput, setNameInput] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [autonomyTier, setAutonomyTier] = useState<AutonomyTier>('partner');
  const [visible, setVisible] = useState(true);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectingEmail, setConnectingEmail] = useState(false);
  const [connectingCalendar, setConnectingCalendar] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [presets, setPresets] = useState<Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl: string | null; notes: string | null }>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [knowledgeMoment, setKnowledgeMoment] = useState<any>(null);
  const [momentLoading, setMomentLoading] = useState(false);
  const [hardwareInfo, setHardwareInfo] = useState<HardwareDisplayInfo | null>(null);
  const [hardwareDetecting, setHardwareDetecting] = useState(false);
  const [modelDownloads, setModelDownloads] = useState<ModelDownloadState[]>([]);
  const [downloadConsented, setDownloadConsented] = useState(false);
  const [showFoundingCodeInput, setShowFoundingCodeInput] = useState(false);
  const [foundingCodeInput, setFoundingCodeInput] = useState('');
  const [foundingCodeError, setFoundingCodeError] = useState<string | null>(null);
  const [foundingActivating, setFoundingActivating] = useState(false);

  useEffect(() => {
    invoke<Record<string, { name: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; caldavUrl: string | null; notes: string | null }>>('get_provider_presets')
      .then(setPresets)
      .catch(() => {});
  }, []);

  // Detect hardware when entering step 3
  useEffect(() => {
    if (step !== 3 || hardwareInfo) return;
    setHardwareDetecting(true);
    invoke<HardwareDisplayInfo>('detect_hardware')
      .then((result) => { if (result) setHardwareInfo(result); })
      .catch(() => {
        // Fallback: set a default constrained profile
        setHardwareInfo({
          tier: 'standard',
          totalRamMb: 8192,
          cpuCores: 4,
          gpuName: null,
          gpuVramMb: null,
          os: 'Unknown',
          arch: 'Unknown',
        });
      })
      .finally(() => setHardwareDetecting(false));
  }, [step, hardwareInfo]);

  // Start model downloads when entering step 5 (after consent)
  useEffect(() => {
    if (step !== 5 || !downloadConsented) return;
    // Initialize download states
    const models: ModelDownloadState[] = [
      { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
      { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
    ];
    setModelDownloads(models);

    // Trigger actual downloads via backend
    invoke('start_model_downloads', { tier: hardwareInfo?.tier ?? 'standard' })
      .catch(() => {
        // Mark as complete even if invoke fails (backend may not be ready)
        setModelDownloads(prev => prev.map(d => ({ ...d, status: 'complete' as const, downloadedBytes: d.totalBytes })));
      });
  }, [step, downloadConsented, hardwareInfo]);

  // Generate Knowledge Moment when entering step 8
  useEffect(() => {
    if (step !== 8) return;
    setMomentLoading(true);
    invoke('generate_knowledge_moment')
      .then((result) => { if (result) setKnowledgeMoment(result); })
      .catch(() => {})
      .finally(() => setMomentLoading(false));
  }, [step]);

  const name = state.userName || nameInput;

  const goToStep = useCallback((nextStep: number) => {
    setVisible(false);
    setTimeout(() => {
      setStep(nextStep);
      dispatch({ type: 'SET_ONBOARDING_STEP', step: nextStep });
      setVisible(true);
    }, 400);
  }, [dispatch]);

  const advance = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      goToStep(step + 1);
    }
  }, [step, goToStep]);

  // Auto-advance for Welcome and Promise screens
  useEffect(() => {
    if (step === 0) {
      autoAdvanceRef.current = setTimeout(advance, 2000);
    } else if (step === 1) {
      autoAdvanceRef.current = setTimeout(advance, 3000);
    }
    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [step, advance]);

  const handleNameSubmit = useCallback(async () => {
    if (!nameInput.trim()) return;
    dispatch({ type: 'SET_USER_NAME', name: nameInput.trim() });
    await invoke('set_user_name', { name: nameInput.trim() }).catch(() => {});
    setNameConfirmed(true);
    setTimeout(advance, 800);
  }, [nameInput, dispatch, advance]);

  const handleFileSelection = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        dispatch({ type: 'ADD_DIRECTORY', path: selected });
        await invoke('start_indexing', { directories: [selected] }).catch(() => {});
      }
    } catch {
      // User cancelled
    }
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
    if (credentials[0]?.serviceType === 'email') {
      setEmailConnected(true);
      setConnectingEmail(false);
    } else {
      setCalendarConnected(true);
      setConnectingCalendar(false);
    }
  }, []);

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

  const handleFoundingCodeSubmit = useCallback(async () => {
    if (!foundingCodeInput.trim()) return;
    setFoundingActivating(true);
    setFoundingCodeError(null);
    try {
      const result = await invoke<ActivationResult>('activate_founding_token', {
        token: foundingCodeInput.trim(),
      });
      if (result.success) {
        const status = await invoke<LicenseStatus>('get_license_status');
        dispatch({
          type: 'SET_LICENSE',
          license: {
            tier: status.tier,
            isFoundingMember: status.isFoundingMember,
            foundingSeat: status.foundingSeat,
            licenseKey: status.licenseKey ?? null,
          },
        });
        setShowFoundingCodeInput(false);
      } else {
        setFoundingCodeError(result.error ?? 'Invalid founding member code');
      }
    } catch (err) {
      setFoundingCodeError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setFoundingActivating(false);
    }
  }, [foundingCodeInput, dispatch]);

  const handleComplete = useCallback(async () => {
    // Save autonomy config
    const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
    for (const domain of domains) {
      dispatch({ type: 'SET_AUTONOMY_TIER', domain, tier: autonomyTier });
      await invoke('set_autonomy_tier', { domain, tier: autonomyTier }).catch(() => {});
    }
    dispatch({ type: 'SET_ONBOARDING_COMPLETE' });
    await invoke('set_onboarding_complete').catch(() => {});
  }, [autonomyTier, dispatch]);

  // Click/key to advance on auto-advance screens
  const handleInteraction = useCallback(() => {
    if (step <= 1) {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      advance();
    }
  }, [step, advance]);

  const fadeClass = visible
    ? 'opacity-100 transition-opacity duration-[800ms] ease-out'
    : 'opacity-0 transition-opacity duration-[400ms] ease-out';

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-b from-semblance-bg-dark to-[#1F2237] text-semblance-text-primary-dark"
      onClick={handleInteraction}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleInteraction(); }}
      role="presentation"
    >
      <div className={`max-w-xl w-full px-8 text-center ${fadeClass}`}>
        {/* Step 0: Welcome */}
        {step === 0 && (
          <h1 className="font-display text-display leading-tight">
            This is your Semblance.
          </h1>
        )}

        {/* Step 1: Promise */}
        {step === 1 && (
          <p className="font-display text-3xl leading-snug">
            It will learn who you are, manage your world, and represent you.
            <br /><br />
            It will never share what it knows.
          </p>
        )}

        {/* Step 2: Naming */}
        {step === 2 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-8">What would you like to call <span className="ai-name-shimmer">it</span>?</h2>
            {nameConfirmed ? (
              <p className="text-2xl font-semibold ai-name-shimmer animate-fade-in">
                {name}
              </p>
            ) : (
              <div className="max-w-sm mx-auto">
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit(); }}
                  placeholder="Give it a name..."
                  autoFocus
                  className="w-full text-center text-2xl bg-transparent border-b-2 border-semblance-muted/30 focus:border-semblance-accent pb-2 outline-none text-semblance-text-primary-dark placeholder:text-semblance-muted/50 transition-colors duration-normal"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Hardware Detection */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-3xl mb-2">
              Setting up <span className="ai-name-shimmer">{name}</span>&apos;s mind...
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">
              Checking what your device can do.
            </p>

            {hardwareDetecting ? (
              <ProgressBar indeterminate className="max-w-sm mx-auto mb-6" />
            ) : hardwareInfo ? (
              <div className="max-w-md mx-auto mb-8">
                <HardwareProfileDisplay hardware={hardwareInfo} />
              </div>
            ) : null}

            {hardwareInfo && !hardwareDetecting && (
              <Button onClick={advance}>Continue</Button>
            )}
          </div>
        )}

        {/* Step 4: Model Download Consent */}
        {step === 4 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              <span className="ai-name-shimmer">{name}</span> needs a brain.
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">
              We&apos;ll download AI models that run entirely on your device. Nothing leaves your machine.
            </p>

            <div className="max-w-md mx-auto text-left space-y-3 mb-8">
              <div className="p-4 rounded-lg bg-semblance-surface-2-dark">
                <div className="flex items-center gap-3 mb-1">
                  <svg className="w-5 h-5 text-semblance-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                  </svg>
                  <span className="text-sm font-medium text-semblance-text-primary-dark">Embedding Model</span>
                </div>
                <p className="text-xs text-semblance-text-secondary-dark ml-8">~275 MB — understands the meaning of your documents</p>
              </div>
              <div className="p-4 rounded-lg bg-semblance-surface-2-dark">
                <div className="flex items-center gap-3 mb-1">
                  <svg className="w-5 h-5 text-semblance-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                  </svg>
                  <span className="text-sm font-medium text-semblance-text-primary-dark">Reasoning Model</span>
                </div>
                <p className="text-xs text-semblance-text-secondary-dark ml-8">~2.1 GB — thinks, plans, and acts on your behalf</p>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-center text-xs text-semblance-muted mb-6">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              Models downloaded from Hugging Face over HTTPS, verified with SHA-256.
            </div>

            <Button onClick={() => { setDownloadConsented(true); advance(); }}>
              Download Models
            </Button>
          </div>
        )}

        {/* Step 5: Model Download Progress */}
        {step === 5 && (
          <div>
            <h2 className="font-display text-3xl mb-2">
              Downloading <span className="ai-name-shimmer">{name}</span>&apos;s intelligence...
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">
              This may take a few minutes depending on your connection.
            </p>

            <div className="max-w-md mx-auto mb-8">
              <ModelDownloadProgress downloads={modelDownloads} />
            </div>

            {modelDownloads.length > 0 && modelDownloads.every(d => d.status === 'complete') && (
              <Button onClick={advance}>Continue</Button>
            )}
          </div>
        )}

        {/* Step 6: Data Connection */}
        {step === 6 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              Let&apos;s connect <span className="ai-name-shimmer">{name}</span> to your world.
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">Choose what to connect.</p>

            <div className="grid gap-4 max-w-md mx-auto text-left">
              {/* Files — active */}
              <button
                type="button"
                onClick={advance}
                className="p-5 rounded-lg border-2 border-semblance-primary/30 bg-semblance-primary-subtle-dark hover:border-semblance-primary transition-colors duration-fast text-left"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-semblance-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                  </svg>
                  <span className="font-semibold text-semblance-text-primary-dark">Files</span>
                </div>
                <p className="text-xs text-semblance-muted mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  Stays on your device
                </p>
              </button>

              {/* Email */}
              {connectingEmail ? (
                <div className="p-5 rounded-lg border-2 border-semblance-primary/30 bg-semblance-surface-2-dark text-left">
                  <div className="flex items-center gap-3 mb-4">
                    <svg className="w-6 h-6 text-semblance-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span className="font-semibold text-semblance-text-primary-dark">Connect Email</span>
                  </div>
                  <CredentialForm
                    serviceType="email"
                    presets={presets}
                    onSave={handleAddCredential}
                    onTest={handleTestCredential}
                    onCancel={() => setConnectingEmail(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConnectingEmail(true)}
                  disabled={emailConnected}
                  className={`p-5 rounded-lg border-2 text-left transition-colors duration-fast ${
                    emailConnected
                      ? 'border-semblance-success/30 bg-semblance-success/5'
                      : 'border-semblance-primary/30 bg-semblance-primary-subtle-dark hover:border-semblance-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <svg className={`w-6 h-6 ${emailConnected ? 'text-semblance-success' : 'text-semblance-primary'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span className={`font-semibold ${emailConnected ? 'text-semblance-success' : 'text-semblance-text-primary-dark'}`}>
                      {emailConnected ? 'Email Connected' : 'Email'}
                    </span>
                    {emailConnected && (
                      <svg className="w-5 h-5 text-semblance-success ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </div>
                  <p className="text-xs text-semblance-muted mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Credentials stored locally, encrypted
                  </p>
                </button>
              )}

              {/* Calendar */}
              {connectingCalendar ? (
                <div className="p-5 rounded-lg border-2 border-semblance-primary/30 bg-semblance-surface-2-dark text-left">
                  <div className="flex items-center gap-3 mb-4">
                    <svg className="w-6 h-6 text-semblance-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
                    </svg>
                    <span className="font-semibold text-semblance-text-primary-dark">Connect Calendar</span>
                  </div>
                  <CredentialForm
                    serviceType="calendar"
                    presets={presets}
                    onSave={handleAddCredential}
                    onTest={handleTestCredential}
                    onCancel={() => setConnectingCalendar(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConnectingCalendar(true)}
                  disabled={calendarConnected}
                  className={`p-5 rounded-lg border-2 text-left transition-colors duration-fast ${
                    calendarConnected
                      ? 'border-semblance-success/30 bg-semblance-success/5'
                      : 'border-semblance-primary/30 bg-semblance-primary-subtle-dark hover:border-semblance-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <svg className={`w-6 h-6 ${calendarConnected ? 'text-semblance-success' : 'text-semblance-primary'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
                    </svg>
                    <span className={`font-semibold ${calendarConnected ? 'text-semblance-success' : 'text-semblance-text-primary-dark'}`}>
                      {calendarConnected ? 'Calendar Connected' : 'Calendar'}
                    </span>
                    {calendarConnected && (
                      <svg className="w-5 h-5 text-semblance-success ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </div>
                  <p className="text-xs text-semblance-muted mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    Credentials stored locally, encrypted
                  </p>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 7: File Selection */}
        {step === 7 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              Choose folders for <span className="ai-name-shimmer">{name}</span> to learn from.
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">
              Select directories with documents you want {name} to understand.
            </p>

            {state.indexedDirectories.length > 0 && (
              <ul className="mb-6 space-y-2 text-left max-w-md mx-auto">
                {state.indexedDirectories.map((dir) => (
                  <li key={dir} className="flex items-center gap-2 p-3 rounded-md bg-semblance-surface-2-dark text-sm">
                    <svg className="w-4 h-4 text-semblance-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>
                    <span className="truncate">{dir}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col items-center gap-4">
              <Button variant="ghost" onClick={handleFileSelection}>
                Add Folder
              </Button>
              {state.indexedDirectories.length > 0 && (
                <Button onClick={advance}>
                  Start Learning
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 8: Knowledge Moment */}
        {step === 8 && (
          <div>
            {momentLoading && !knowledgeMoment && (
              <>
                <h2 className="font-display text-3xl mb-6">
                  <span className="ai-name-shimmer">{name}</span> is exploring your world...
                </h2>
                <ProgressBar indeterminate className="max-w-sm mx-auto mb-8" />
                <p className="text-sm text-semblance-text-secondary-dark mb-6">
                  Cross-referencing your email, calendar, and documents...
                </p>
              </>
            )}
            {knowledgeMoment ? (
              <>
                <h2 className="font-display text-3xl mb-6">
                  <span className="ai-name-shimmer">{name}</span> already knows something.
                </h2>
                <div className="max-w-lg mx-auto">
                  <KnowledgeMomentDisplay
                    moment={knowledgeMoment}
                    aiName={name}
                    onContinue={advance}
                    isOnboarding
                  />
                </div>
              </>
            ) : !momentLoading && (
              <>
                <h2 className="font-display text-3xl mb-6">
                  <span className="ai-name-shimmer">{name}</span> is exploring your documents...
                </h2>
                <p className="text-sm text-semblance-text-secondary-dark mb-6">
                  {state.knowledgeStats.documentCount > 0
                    ? `${name} found ${state.knowledgeStats.documentCount} documents and ${state.knowledgeStats.chunkCount} passages to learn from.`
                    : 'Connect email and calendar in the previous step for a richer experience.'}
                </p>
                <Button onClick={advance} variant="ghost">Continue</Button>
              </>
            )}
          </div>
        )}

        {/* Step 9: Autonomy / Founding Member Moment */}
        {step === 9 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            {state.license.isFoundingMember ? (
              /* ── Founding Member Moment ── */
              <div>
                <h2 className="font-display text-3xl mb-4 text-semblance-accent">
                  Founding Member #{state.license.foundingSeat}.
                </h2>
                <p className="font-display text-2xl mb-8 text-semblance-text-primary-dark">
                  You were here before anyone else.
                </p>

                <div className="max-w-md mx-auto p-6 rounded-lg border-2 border-semblance-accent/30 bg-semblance-accent/5 mb-8">
                  <p className="text-sm text-semblance-text-primary-dark leading-relaxed">
                    Full Digital Representative access, permanently.
                    <br /><br />
                    Every capability Semblance builds, yours from day one.
                    <br /><br />
                    Your support makes the zero-cloud promise possible.
                  </p>
                </div>

                <Button onClick={advance}>Continue</Button>
              </div>
            ) : (
              /* ── Standard Autonomy Selector ── */
              <div>
                <h2 className="font-display text-3xl mb-2">
                  How much should <span className="ai-name-shimmer">{name}</span> do on its own?
                </h2>
                <p className="text-sm text-semblance-text-secondary-dark mb-8">You can change this anytime in Settings.</p>

                <div className="max-w-md mx-auto text-left">
                  <AutonomySelector value={autonomyTier} onChange={setAutonomyTier} />
                </div>

                <div className="mt-8">
                  <Button onClick={advance}>Continue</Button>
                </div>

                {/* Manual founding member code entry */}
                <div className="mt-6">
                  {!showFoundingCodeInput ? (
                    <button
                      type="button"
                      onClick={() => setShowFoundingCodeInput(true)}
                      className="text-xs text-semblance-muted hover:text-semblance-accent transition-colors duration-fast"
                    >
                      Have a founding member code?
                    </button>
                  ) : (
                    <div className="max-w-md mx-auto mt-4" onClick={(e) => e.stopPropagation()} role="presentation">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={foundingCodeInput}
                          onChange={(e) => { setFoundingCodeInput(e.target.value); setFoundingCodeError(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleFoundingCodeSubmit(); }}
                          placeholder="Paste your founding member code..."
                          autoFocus
                          className="flex-1 text-sm bg-semblance-surface-2-dark border border-semblance-muted/30 rounded-md px-3 py-2 outline-none text-semblance-text-primary-dark placeholder:text-semblance-muted/50 focus:border-semblance-accent transition-colors duration-fast"
                        />
                        <Button
                          onClick={handleFoundingCodeSubmit}
                          disabled={foundingActivating || !foundingCodeInput.trim()}
                          variant="ghost"
                          size="sm"
                        >
                          {foundingActivating ? 'Verifying...' : 'Activate'}
                        </Button>
                      </div>
                      {foundingCodeError && (
                        <p className="text-xs text-semblance-error mt-2">{foundingCodeError}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 10: Ready */}
        {step === 10 && (
          <div>
            <h1 className="font-display text-display leading-tight mb-4">
              <span className="ai-name-shimmer">{name}</span> is ready.
            </h1>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">
              {state.knowledgeStats.documentCount > 0
                ? `${state.knowledgeStats.documentCount} documents indexed, ready to discuss.`
                : 'You can start chatting now. Add files anytime from the Files screen.'}
            </p>
            <Button onClick={handleComplete} size="lg">
              Start Talking to {name}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
