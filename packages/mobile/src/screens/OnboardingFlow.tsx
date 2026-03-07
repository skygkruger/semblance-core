// OnboardingFlow — 10-step onboarding using semblance-ui native components.
// Container manages step state + mobile data layer integration.
// Mirrors desktop OnboardingFlow pattern adapted for React Native.

import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import DeviceInfo from 'react-native-device-info';
import {
  SplashScreen,
  HardwareDetection,
  DataSourcesStep,
  AutonomyTierStep,
  NamingMoment,
  NamingYourAI,
  InitializeStep,
  TermsAcceptanceStep,
  LanguageSelect,
} from '@semblance/ui';
import type { HardwareInfo, ModelDownload, KnowledgeMomentData, AutonomyTier } from '@semblance/ui';
import { detectOSLocale } from '../../../core/i18n/supported-languages';

const PREFS_PATH = `${RNFS.DocumentDirectoryPath}/semblance-onboarding-prefs.json`;

async function persistPref(key: string, value: string): Promise<void> {
  try {
    let prefs: Record<string, string> = {};
    const exists = await RNFS.exists(PREFS_PATH);
    if (exists) {
      const raw = await RNFS.readFile(PREFS_PATH, 'utf8');
      prefs = JSON.parse(raw) as Record<string, string>;
    }
    prefs[key] = value;
    await RNFS.writeFile(PREFS_PATH, JSON.stringify(prefs), 'utf8');
  } catch (err) {
    console.warn('[OnboardingFlow] Failed to persist preference:', key, err);
  }
}

type OnboardingStep =
  | 'language-select'
  | 'splash'
  | 'hardware'
  | 'data-sources'
  | 'autonomy'
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
  'naming-moment',
  'naming-ai',
  'initialize',
  'terms',
];

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('language-select');

  // Hardware detection state
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);
  const [detecting, setDetecting] = useState(false);

  // AI name state
  const [aiName, setAiName] = useState('Semblance');

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

  // Handle language selection
  const handleLanguageConfirm = useCallback((code: string) => {
    persistPref('language', code);
    goNext();
  }, [goNext]);

  // Detect hardware on mobile device when entering hardware step
  useEffect(() => {
    if (step !== 'hardware' || hardwareInfo) return;
    setDetecting(true);

    // Use react-native-device-info for real hardware detection
    (async () => {
      try {
        const totalRamBytes = await DeviceInfo.getTotalMemory();
        const totalRamMb = Math.round(totalRamBytes / (1024 * 1024));
        const cpuCores = await DeviceInfo.supportedAbis().then(abis => abis.length > 0 ? abis.length : 4);

        setHardwareInfo({
          tier: totalRamMb >= 6144 ? 'capable' : 'standard',
          totalRamMb,
          cpuCores,
          gpuName: null,
          gpuVramMb: null,
          os: Platform.OS === 'ios' ? 'iOS' : 'Android',
          arch: Platform.OS === 'ios' ? 'arm64' : 'arm64',
          voiceCapable: totalRamMb >= 4096,
        });
      } catch (err) {
        console.warn('[OnboardingFlow] Hardware detection failed, using defaults:', err);
        const fallbackRam = Platform.OS === 'ios' ? 6144 : 4096;
        setHardwareInfo({
          tier: fallbackRam >= 6144 ? 'capable' : 'standard',
          totalRamMb: fallbackRam,
          cpuCores: 4,
          gpuName: null,
          gpuVramMb: null,
          os: Platform.OS === 'ios' ? 'iOS' : 'Android',
          arch: 'arm64',
          voiceCapable: fallbackRam >= 4096,
        });
      } finally {
        setDetecting(false);
      }
    })();
  }, [step, hardwareInfo]);

  // Start model downloads + knowledge moment on initialize step
  useEffect(() => {
    if (step !== 'initialize') return;

    const models: ModelDownload[] = [
      { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
      { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' },
    ];
    setDownloads(models);

    // Requires native module integration for real download progress from inference bridge
    console.warn('[OnboardingFlow] Model download progress uses simulated values — requires native inference bridge');
    setMomentLoading(true);
    const momentTimer = setTimeout(() => {
      setKnowledgeMoment({
        title: 'Your Knowledge Base',
        summary: 'Semblance is ready to learn from your data. Connect your accounts to start building your personal knowledge graph.',
        connections: ['Email → Calendar', 'Contacts → Messages', 'Documents → Topics'],
      });
      setMomentLoading(false);
    }, 2000);

    // Simulated download progress — requires native inference bridge for real events
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
    persistPref('userName', userName);
    goNext();
  }, [goNext]);

  // Handle AI naming
  const handleNamingAI = useCallback((name: string) => {
    setAiName(name);
    persistPref('aiName', name);
    goNext();
  }, [goNext]);

  // Handle autonomy selection
  const handleAutonomyContinue = useCallback(() => {
    persistPref('autonomyTier', autonomy);
    goNext();
  }, [autonomy, goNext]);

  // Handle final completion
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  return (
    <View style={styles.container}>
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
          onComplete={goNext}
          aiName={aiName}
        />
      )}

      {step === 'terms' && (
        <TermsAcceptanceStep onAccept={handleComplete} />
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
