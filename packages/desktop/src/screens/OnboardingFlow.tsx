// OnboardingFlow — Multi-step onboarding sequence using semblance-ui components.
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
  AlterEgoWeekOffer,
  InitialIndexStep,
} from '@semblance/ui';
import type { HardwareInfo, ModelDownload, KnowledgeMomentData, AutonomyTier, DataSourceStatus, IndexingSource } from '@semblance/ui';
import { detectOSLocale } from '@semblance/core/i18n/supported-languages';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
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
  ipcSend,
  sidecarCall,
  retryModelDownload,
  prefGet,
  prefSet,
} from '../ipc/commands';
import type { HardwareDisplayInfo, KnowledgeMoment } from '../ipc/types';

type OnboardingStep =
  | 'language-select'
  | 'splash'
  | 'hardware'
  | 'data-sources'
  | 'initial-index'
  | 'autonomy'
  | 'alter-ego-offer'
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
  'initial-index',
  'autonomy',
  'intent-capture',
  'naming-moment',
  'naming-ai',
  'initialize',
  'alter-ego-offer',
  'terms',
];

/** Map data source IDs to connector IDs for OAuth */
const SOURCE_TO_CONNECTOR: Record<string, string> = {
  email: 'gmail',
  calendar: 'google-calendar',
  slack: 'slack-oauth',
};

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

  // Data sources state — tracks OAuth status per source
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, DataSourceStatus>>({});

  // Indexing state
  const [indexingSources, setIndexingSources] = useState<IndexingSource[]>([]);
  const [indexingComplete, setIndexingComplete] = useState(false);

  // Whether any data has been indexed (drives knowledge moment)
  const [hasIndexedData, setHasIndexedData] = useState(false);

  // Resume onboarding on mount if app was force-closed mid-flow
  useEffect(() => {
    prefGet('onboarding_current_step').then(savedStep => {
      if (savedStep && STEP_ORDER.includes(savedStep as OnboardingStep)) {
        setStep(savedStep as OnboardingStep);
      }
    }).catch(() => {});
  }, []);

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      const nextStep = STEP_ORDER[nextIndex];
      if (nextStep) {
        setStep(nextStep);
        // Persist progress for resume on force-close
        prefSet('onboarding_current_step', nextStep).catch(() => {});
      }
    }
  }, [currentIndex]);

  const goBack = useCallback(() => {
    if (currentIndex > 0) {
      const prevStep = STEP_ORDER[currentIndex - 1];
      if (prevStep) setStep(prevStep);
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

  // Handle connecting a data source via OAuth
  const handleConnectSource = useCallback(async (sourceId: string, connectorId: string) => {
    setSourceStatuses(prev => ({ ...prev, [sourceId]: 'connecting' }));
    try {
      const result = await ipcSend({
        action: 'connector.auth',
        payload: { connectorId },
      });
      if (result && typeof result === 'object' && (result as Record<string, unknown>).success === false) {
        setSourceStatuses(prev => ({ ...prev, [sourceId]: 'error' }));
        emit('semblance://toast', {
          id: `conn_err_${Date.now()}`,
          message: (result as Record<string, unknown>).error as string || 'Connection failed',
          variant: 'attention',
        }).catch(() => {});
      } else {
        setSourceStatuses(prev => ({ ...prev, [sourceId]: 'connected' }));
        // Trigger sync
        ipcSend({
          action: 'connector.sync',
          payload: { connectorId },
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[OnboardingFlow] Failed to connect ${connectorId}:`, err);
      setSourceStatuses(prev => ({ ...prev, [sourceId]: 'error' }));
    }
  }, []);

  // Listen for indexing events
  useEffect(() => {
    if (step !== 'initial-index') return;

    // Set up initial indexing sources from connected data sources
    const connectedSources: IndexingSource[] = [];
    for (const [sourceId, status] of Object.entries(sourceStatuses)) {
      if (status === 'connected') {
        const nameMap: Record<string, string> = {
          email: 'Email',
          calendar: 'Calendar',
          slack: 'Slack',
        };
        connectedSources.push({
          id: sourceId,
          name: nameMap[sourceId] ?? sourceId,
          count: 0,
          status: 'indexing',
        });
      }
    }
    setIndexingSources(connectedSources);

    if (connectedSources.length === 0) {
      setIndexingComplete(true);
      return;
    }

    let unlisten: UnlistenFn | undefined;
    listen<{ connectorId: string; count?: number }>(
      'semblance://indexing-complete',
      (event) => {
        const { connectorId, count } = event.payload;
        // Map connector IDs back to source IDs
        const sourceId = Object.entries(SOURCE_TO_CONNECTOR).find(
          ([, cId]) => cId === connectorId
        )?.[0] ?? connectorId;

        setIndexingSources(prev => {
          const updated = prev.map(s =>
            s.id === sourceId
              ? { ...s, status: 'complete' as const, count: count ?? s.count }
              : s
          );
          const allDone = updated.every(s => s.status === 'complete');
          if (allDone) {
            setIndexingComplete(true);
            const total = updated.reduce((sum, s) => sum + s.count, 0);
            if (total > 0) setHasIndexedData(true);
          }
          return updated;
        });
      }
    ).then((fn) => { unlisten = fn; });

    // Auto-complete after 30s timeout regardless
    const timeout = setTimeout(() => {
      setIndexingComplete(true);
      setIndexingSources(prev => {
        const completed = prev.map(s =>
          s.status !== 'complete' ? { ...s, status: 'complete' as const } : s
        );
        const total = completed.reduce((sum, s) => sum + s.count, 0);
        if (total > 0) setHasIndexedData(true);
        return completed;
      });
    }, 30_000);

    return () => {
      unlisten?.();
      clearTimeout(timeout);
    };
  }, [step, sourceStatuses]);

  // Start model downloads + knowledge moment on initialize step
  useEffect(() => {
    if (step !== 'initialize') return;

    // Let the sidecar emit real progress events with accurate model names and sizes.
    setDownloads([]);

    // Listen for NativeRuntime model loaded event (reasoning model ready).
    // Fires for native loads (modelType='reasoning') AND Ollama detection (engine='ollama').
    let unlistenModelLoaded: UnlistenFn | undefined;
    listen<{ modelId?: string; modelType?: string; path?: string; engine?: string }>(
      'semblance://native-model-loaded',
      (event) => {
        if (event.payload.modelType === 'reasoning' || event.payload.engine === 'ollama') {
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

    // Start knowledge moment generation — only if data has been indexed
    if (hasIndexedData) {
      setMomentLoading(true);
      generateKnowledgeMoment()
        .then((result) => setKnowledgeMoment(toKnowledgeMomentData(result)))
        .catch(() => {})
        .finally(() => {
          setMomentLoading(false);
        });
    }

    return () => { unlisten?.(); unlistenModelLoaded?.(); };
  }, [step, hardwareInfo, hasIndexedData]);

  // Timeout fallback: if all downloads complete but runtime never reports ready,
  // allow proceeding after 3s (Ollama users get instant readiness via the
  // native-model-loaded event; this is a safety net for edge cases).
  useEffect(() => {
    if (step !== 'initialize' || runtimeReady) return;
    const allComplete = downloads.length > 0 && downloads.every(d => d.status === 'complete');
    if (!allComplete) return;

    const timer = setTimeout(() => {
      console.error('[OnboardingFlow] Runtime ready timeout — allowing proceed');
      setRuntimeReady(true);
    }, 3_000);
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

  // Handle Alter Ego Week acceptance
  const handleAlterEgoAccept = useCallback(async () => {
    try {
      await sidecarCall('alter_ego_week_start');
    } catch {
      // Backend may not be ready — acceptance still proceeds
    }
    goNext();
  }, [goNext]);

  // Handle model download retry
  const handleRetryModel = useCallback((modelName: string) => {
    retryModelDownload(modelName).catch((err) => {
      console.error('[OnboardingFlow] retryModelDownload failed:', err);
    });
  }, []);

  // Handle final completion
  const handleComplete = useCallback(async () => {
    // Clear saved step so resume doesn't trigger after completion
    prefSet('onboarding_current_step', '').catch(() => {});
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
          sourceStatuses={sourceStatuses}
          onConnectSource={handleConnectSource}
          onContinue={() => goNext()}
          onSkip={goNext}
          onBack={goBack}
        />
      )}

      {step === 'initial-index' && (
        <InitialIndexStep
          sources={indexingSources}
          complete={indexingComplete}
          onContinue={goNext}
          onBack={goBack}
        />
      )}

      {step === 'autonomy' && (
        <AutonomyTierStep
          value={autonomy}
          onChange={setAutonomy}
          onContinue={handleAutonomyContinue}
          onBack={goBack}
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
          knowledgeMoment={hasIndexedData ? knowledgeMoment : null}
          loading={hasIndexedData ? momentLoading : false}
          onComplete={goNext}
          aiName={aiName}
          runtimeReady={runtimeReady}
          onRetryModel={handleRetryModel}
        />
      )}

      {step === 'alter-ego-offer' && (
        <AlterEgoWeekOffer
          onAccept={handleAlterEgoAccept}
          onSkip={goNext}
          onBack={goBack}
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
