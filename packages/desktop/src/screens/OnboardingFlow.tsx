// OnboardingFlow — 10-step onboarding sequence using semblance-ui components.
// Container that manages step state and IPC, delegates presentation to library pages.

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SplashScreen,
  HardwareDetection,
  DataSourcesStep,
  AutonomyTierStep,
  NamingMoment,
  NamingYourAI,
  InitializeStep,
  TermsAcceptanceStep,
  IntentCapture,
  LanguageSelect,
  DotMatrix,
} from '@semblance/ui';
import type { HardwareInfo, ModelDownload, KnowledgeMomentData, AutonomyTier } from '@semblance/ui';
import { detectOSLocale } from '@semblance/core/i18n/supported-languages';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useAppDispatch } from '../state/AppState';

import {
  detectHardware,
  setUserName,
  setAiName as saveAiNamePref,
  setAutonomyTier,
  startModelDownloads,
  generateKnowledgeMoment,
  setOnboardingComplete,
  setIntentOnboarding,
  setLanguagePreference,
} from '../ipc/commands';
import type { HardwareDisplayInfo, KnowledgeMoment } from '../ipc/types';

type OnboardingStep =
  | 'language-select'
  | 'splash'
  | 'hardware'
  | 'data-sources'
  | 'autonomy'
  | 'intent-capture'
  | 'naming-moment'
  | 'naming-ai'
  | 'initialize'
  | 'terms';

const STEP_ORDER: OnboardingStep[] = [
  'language-select',
  'splash',
  'hardware',
  'data-sources',
  'autonomy',
  'intent-capture',
  'naming-moment',
  'naming-ai',
  'initialize',
  'terms',
];

/** Map IPC HardwareDisplayInfo to semblance-ui HardwareInfo */
function toHardwareInfo(hw: HardwareDisplayInfo): HardwareInfo {
  const validTiers = ['workstation', 'performance', 'capable', 'standard', 'constrained'] as const;
  const tier = validTiers.includes(hw.tier as typeof validTiers[number])
    ? hw.tier as HardwareInfo['tier']
    : 'standard' as const;
  return {
    tier,
    totalRamMb: hw.totalRamMb,
    cpuCores: hw.cpuCores,
    gpuName: hw.gpu?.name ?? null,
    gpuVramMb: hw.gpu?.vramMb ?? null,
    os: hw.os,
    arch: hw.cpuArch,
    voiceCapable: hw.voiceCapable,
  };
}

/** Map IPC KnowledgeMoment to semblance-ui KnowledgeMomentData */
function toKnowledgeMomentData(km: KnowledgeMoment): KnowledgeMomentData {
  return {
    title: km.title,
    summary: km.summary,
    connections: km.connections.map(c => `${c.from} → ${c.to}`),
  };
}

export function OnboardingFlow() {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<OnboardingStep>('language-select');
  const dispatch = useAppDispatch();
  // Hardware detection state
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [detecting, setDetecting] = useState(false);

  // AI name state
  const [aiName, setAiName] = useState('Semblance');

  // Autonomy state
  const [autonomy, setAutonomy] = useState<AutonomyTier>('partner');

  // Model download state
  const [downloads, setDownloads] = useState<ModelDownload[]>([]);

  // NativeRuntime readiness — set when reasoning model is loaded or timeout expires
  const [runtimeReady, setRuntimeReady] = useState(false);

  // Knowledge moment state
  const [knowledgeMoment, setKnowledgeMoment] = useState<KnowledgeMomentData | null>(null);
  const [momentLoading, setMomentLoading] = useState(false);

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      const nextStep = STEP_ORDER[nextIndex];
      if (nextStep) setStep(nextStep);
    }
  }, [currentIndex]);

  // Handle language selection
  const handleLanguageConfirm = useCallback(async (code: string) => {
    dispatch({ type: 'SET_LANGUAGE', code });
    await setLanguagePreference(code).catch(() => {});
    await i18n.changeLanguage(code);
    goNext();
  }, [dispatch, goNext, i18n]);

  // Detect hardware when entering hardware step
  useEffect(() => {
    if (step !== 'hardware' || hardwareInfo) return;
    setDetecting(true);
    detectHardware()
      .then((result) => setHardwareInfo(toHardwareInfo(result)))
      .catch((err) => {
        console.error('[OnboardingFlow] detectHardware failed:', err);
        setHardwareInfo({
          tier: 'standard',
          totalRamMb: 8192,
          cpuCores: 4,
          gpuName: null,
          gpuVramMb: null,
          os: t('model.unknown'),
          arch: t('model.unknown'),
          voiceCapable: true,
        });
      })
      .finally(() => setDetecting(false));
  }, [step, hardwareInfo]);

  // Start model downloads + knowledge moment on initialize step
  useEffect(() => {
    if (step !== 'initialize') return;

    // Let the sidecar emit real progress events with accurate model names and sizes.
    setDownloads([]);

    // Listen for NativeRuntime model loaded event (reasoning model ready)
    let unlistenModelLoaded: UnlistenFn | undefined;
    listen<{ modelId: string; modelType: string; path: string }>(
      'semblance://native-model-loaded',
      (event) => {
        if (event.payload.modelType === 'reasoning') {
          setRuntimeReady(true);
        }
      }
    ).then((fn) => { unlistenModelLoaded = fn; });

    // Set up event listener BEFORE starting downloads to avoid race condition
    let unlisten: UnlistenFn | undefined;
    listen<{
      modelId: string;
      modelName: string;
      totalBytes: number;
      downloadedBytes: number;
      speedBytesPerSec: number;
      status: 'pending' | 'downloading' | 'complete' | 'error';
      error?: string;
    }>('semblance://model-download-progress', (event) => {
      const p = event.payload;
      setDownloads(prev => {
        // Match by modelId (stable) rather than modelName (localized)
        const idx = prev.findIndex(d =>
          (d as { modelId?: string }).modelId === p.modelId || d.modelName === p.modelName
        );
        const entry: ModelDownload = {
          modelName: p.modelName,
          totalBytes: p.totalBytes,
          downloadedBytes: p.downloadedBytes,
          speedBytesPerSec: p.speedBytesPerSec,
          status: p.status,
        };
        // Attach modelId for future matching
        (entry as { modelId?: string }).modelId = p.modelId;
        if (idx === -1) {
          return [...prev, entry];
        }
        const updated = [...prev];
        updated[idx] = entry;
        return updated;
      });
    }).then((fn) => { unlisten = fn; });

    // Start downloads after listener is registered
    startModelDownloads(hardwareInfo?.tier ?? 'standard')
      .catch((err) => {
        console.error('[OnboardingFlow] startModelDownloads failed:', err);
        setDownloads([{
          modelName: 'Download Error',
          totalBytes: 0,
          downloadedBytes: 0,
          speedBytesPerSec: 0,
          status: 'error',
        }]);
      });

    // Start knowledge moment generation
    setMomentLoading(true);
    generateKnowledgeMoment()
      .then((result) => setKnowledgeMoment(toKnowledgeMomentData(result)))
      .catch(() => {})
      .finally(() => {
        setMomentLoading(false);
      });

    return () => { unlisten?.(); unlistenModelLoaded?.(); };
  }, [step, hardwareInfo]);

  // Timeout fallback: if all downloads complete but runtime never reports ready,
  // allow proceeding after 30s (model may have loaded via Ollama fallback).
  useEffect(() => {
    if (step !== 'initialize' || runtimeReady) return;
    const allComplete = downloads.length > 0 && downloads.every(d => d.status === 'complete');
    if (!allComplete) return;

    const timer = setTimeout(() => {
      console.error('[OnboardingFlow] Runtime ready timeout — allowing proceed');
      setRuntimeReady(true);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [step, runtimeReady, downloads]);

  // Handle naming moment (user's name)
  const handleNamingMoment = useCallback(async (userName: string) => {
    dispatch({ type: 'SET_USER_NAME', name: userName });
    await setUserName(userName).catch(() => {});
    goNext();
  }, [dispatch, goNext]);

  // Handle autonomy selection
  const handleAutonomyContinue = useCallback(async () => {
    const domains = ['email', 'calendar', 'files', 'finances', 'health', 'services'];
    for (const domain of domains) {
      dispatch({ type: 'SET_AUTONOMY_TIER', domain, tier: autonomy });
      await setAutonomyTier(domain, autonomy).catch(() => {});
    }
    goNext();
  }, [autonomy, dispatch, goNext]);

  // Handle intent capture
  const handleIntentCapture = useCallback(async (responses: { primaryGoal: string; hardLimit: string; personalValue: string }) => {
    await setIntentOnboarding({
      primaryGoal: responses.primaryGoal || undefined,
      hardLimit: responses.hardLimit || undefined,
      personalValue: responses.personalValue || undefined,
    }).catch(() => {});
    goNext();
  }, [goNext]);

  // Handle final completion
  const handleComplete = useCallback(async () => {
    try {
      await setOnboardingComplete();
    } catch {
      // Backend not ready — still mark complete in UI state
    }
    dispatch({ type: 'SET_ONBOARDING_COMPLETE' });
  }, [dispatch]);

  return (
    <div
      className="h-screen flex flex-col items-center justify-center"
      style={{ backgroundColor: '#0B0E11', color: '#EEF1F4' }}
    >
      <DotMatrix />
      {step === 'language-select' && (
        <LanguageSelect
          detectedCode={detectOSLocale()}
          onConfirm={handleLanguageConfirm}
        />
      )}

      {step === 'splash' && (
        <SplashScreen onBegin={goNext} />
      )}

      {step === 'hardware' && (
        <HardwareDetection
          hardwareInfo={hardwareInfo}
          detecting={detecting}
          onContinue={goNext}
        />
      )}

      {step === 'data-sources' && (
        <DataSourcesStep
          onContinue={() => goNext()}
          onSkip={goNext}
        />
      )}

      {step === 'autonomy' && (
        <AutonomyTierStep
          value={autonomy}
          onChange={setAutonomy}
          onContinue={handleAutonomyContinue}
        />
      )}

      {step === 'intent-capture' && (
        <IntentCapture onComplete={handleIntentCapture} onSkip={goNext} />
      )}

      {step === 'naming-moment' && (
        <NamingMoment onComplete={handleNamingMoment} />
      )}

      {step === 'naming-ai' && (
        <NamingYourAI onComplete={async (name) => { setAiName(name); dispatch({ type: 'SET_SEMBLANCE_NAME', name }); await saveAiNamePref(name).catch(() => {}); goNext(); }} />
      )}

      {step === 'initialize' && (
        <InitializeStep
          downloads={downloads}
          knowledgeMoment={knowledgeMoment}
          loading={momentLoading}
          onComplete={goNext}
          aiName={aiName}
          runtimeReady={runtimeReady}
        />
      )}

      {step === 'terms' && (
        <TermsAcceptanceStep onAccept={handleComplete} />
      )}

      {/* Step indicator */}
      <div className="absolute bottom-8 flex gap-2">
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: i <= currentIndex ? '#6ECFA3' : '#2A2F35',
            }}
          />
        ))}
      </div>
    </div>
  );
}
