// OnboardingFlow — 7-step onboarding using semblance-ui native components.
// Container manages step state + mobile data layer integration.
// Mirrors desktop OnboardingFlow pattern adapted for React Native.

import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('splash');

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

  // Detect hardware on mobile device when entering hardware step
  useEffect(() => {
    if (step !== 'hardware' || hardwareInfo) return;
    setDetecting(true);

    // TODO: Sprint 2 — wire to unified-bridge.ts detectMobilePlatform() + device-info
    // For now, build HardwareInfo from available device data
    const timer = setTimeout(() => {
      setHardwareInfo({
        tier: 'capable',
        totalRamMb: 6144,
        cpuCores: 6,
        gpuName: null,
        gpuVramMb: null,
        os: 'Mobile',
        arch: 'arm64',
      });
      setDetecting(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [step, hardwareInfo]);

  // Start model downloads + knowledge moment on initialize step
  useEffect(() => {
    if (step !== 'initialize') return;

    const models: ModelDownload[] = [
      { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
      { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
    ];
    setDownloads(models);

    // TODO: Sprint 2 — wire to unified-bridge.ts loadModel() for real download progress
    setMomentLoading(true);
    const momentTimer = setTimeout(() => {
      setKnowledgeMoment({
        title: 'Your Knowledge Base',
        summary: 'Semblance is ready to learn from your data. Connect your accounts to start building your personal knowledge graph.',
        connections: ['Email → Calendar', 'Contacts → Messages', 'Documents → Topics'],
      });
      setMomentLoading(false);
    }, 2000);

    // Simulate download progress
    // TODO: Sprint 2 — replace with real download events from inference bridge
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

    return () => {
      clearTimeout(momentTimer);
      clearInterval(progressInterval);
    };
  }, [step]);

  // Handle naming moment (user's name)
  const handleNamingMoment = useCallback((userName: string) => {
    // TODO: Sprint 2 — persist to local storage or Core
    goNext();
  }, [goNext]);

  // Handle AI naming
  const handleNamingAI = useCallback((_aiName: string) => {
    // TODO: Sprint 2 — persist AI name to Core
    goNext();
  }, [goNext]);

  // Handle autonomy selection
  const handleAutonomyContinue = useCallback(() => {
    // TODO: Sprint 2 — persist autonomy tier to Core for all domains
    goNext();
  }, [goNext]);

  // Handle final completion
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <View style={styles.container}>
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
        <NamingYourAI onComplete={handleNamingAI} />
      )}

      {step === 'initialize' && (
        <InitializeStep
          downloads={downloads}
          knowledgeMoment={knowledgeMoment}
          loading={momentLoading}
          onComplete={handleComplete}
        />
      )}

      {/* Step indicator dots */}
      <View style={styles.stepIndicator}>
        {STEP_ORDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.dot,
              i <= currentIndex ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E11',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#6ECFA3',
  },
  dotInactive: {
    backgroundColor: '#2A2F35',
  },
});
