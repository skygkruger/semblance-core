// OnboardingFlow — 7-step onboarding sequence using semblance-ui components.
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
} from '@semblance/ui';
import type { HardwareInfo, ModelDownload, KnowledgeMomentData, AutonomyTier } from '@semblance/ui';
import { useAppDispatch } from '../state/AppState';
import {
  detectHardware,
  setUserName,
  setAutonomyTier,
  startModelDownloads,
  generateKnowledgeMoment,
  setOnboardingComplete,
} from '../ipc/commands';
import type { HardwareDisplayInfo, KnowledgeMoment } from '../ipc/types';

type OnboardingStep =
  | 'splash'
  | 'hardware'
  | 'data-sources'
  | 'autonomy'
  | 'naming-moment'
  | 'naming-ai'
  | 'initialize';

const STEP_ORDER: OnboardingStep[] = [
  'splash',
  'hardware',
  'data-sources',
  'autonomy',
  'naming-moment',
  'naming-ai',
  'initialize',
];

/** Map IPC HardwareDisplayInfo to semblance-ui HardwareInfo */
function toHardwareInfo(hw: HardwareDisplayInfo): HardwareInfo {
  const tier = (hw.tier === 'capable' || hw.tier === 'standard' || hw.tier === 'constrained')
    ? hw.tier
    : 'standard';
  return { ...hw, tier };
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
  const { t } = useTranslation();
  const [step, setStep] = useState<OnboardingStep>('splash');
  const dispatch = useAppDispatch();

  // Hardware detection state
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Autonomy state
  const [autonomy, setAutonomy] = useState<AutonomyTier>('partner');

  // Model download state
  const [downloads, setDownloads] = useState<ModelDownload[]>([]);

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

  // Detect hardware when entering hardware step
  useEffect(() => {
    if (step !== 'hardware' || hardwareInfo) return;
    setDetecting(true);
    detectHardware()
      .then((result) => setHardwareInfo(toHardwareInfo(result)))
      .catch(() => {
        setHardwareInfo({
          tier: 'standard',
          totalRamMb: 8192,
          cpuCores: 4,
          gpuName: null,
          gpuVramMb: null,
          os: t('model.unknown'),
          arch: t('model.unknown'),
        });
      })
      .finally(() => setDetecting(false));
  }, [step, hardwareInfo]);

  // Start model downloads + knowledge moment on initialize step
  useEffect(() => {
    if (step !== 'initialize') return;

    // Initialize download states
    const models: ModelDownload[] = [
      { modelName: t('model.embedding'), totalBytes: 275_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
      { modelName: t('model.reasoning'), totalBytes: 2_100_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
    ];
    setDownloads(models);

    startModelDownloads(hardwareInfo?.tier ?? 'standard')
      .catch(() => {
        // Backend not ready — mark as complete so user can proceed
        setDownloads(prev => prev.map(d => ({ ...d, status: 'complete' as const, downloadedBytes: d.totalBytes })));
      });

    // Also start knowledge moment generation
    setMomentLoading(true);
    generateKnowledgeMoment()
      .then((result) => setKnowledgeMoment(toKnowledgeMomentData(result)))
      .catch(() => {})
      .finally(() => setMomentLoading(false));

    // Simulate download progress until backend sends real events
    // TODO: Sprint 2 — replace with Tauri event listener for download_progress events
    const progressInterval = setInterval(() => {
      setDownloads(prev => {
        const allDone = prev.every(d => d.status === 'complete');
        if (allDone) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev.map(d => {
          if (d.status === 'complete') return d;
          const increment = d.totalBytes * 0.15;
          const next = Math.min(d.downloadedBytes + increment, d.totalBytes);
          return {
            ...d,
            downloadedBytes: next,
            speedBytesPerSec: increment,
            status: next >= d.totalBytes ? 'complete' as const : 'downloading' as const,
          };
        });
      });
    }, 800);

    return () => clearInterval(progressInterval);
  }, [step, hardwareInfo]);

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

      {step === 'naming-moment' && (
        <NamingMoment onComplete={handleNamingMoment} />
      )}

      {step === 'naming-ai' && (
        <NamingYourAI onComplete={() => goNext()} />
      )}

      {step === 'initialize' && (
        <InitializeStep
          downloads={downloads}
          knowledgeMoment={knowledgeMoment}
          loading={momentLoading}
          onComplete={handleComplete}
        />
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
