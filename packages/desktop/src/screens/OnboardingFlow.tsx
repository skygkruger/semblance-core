// OnboardingFlow — 7-step onboarding sequence using semblance-ui components.
// Replaces the old 11-step OnboardingScreen.
// Steps: Splash, HardwareDetection, DataSources, AutonomyTier, NamingMoment,
//        NamingYourAI, Initialize.
// Full component wiring in Phase 4/5 when semblance-ui onboarding pages are ported.

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppDispatch } from '../state/AppState';

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

export function OnboardingFlow() {
  const [step, setStep] = useState<OnboardingStep>('splash');
  const dispatch = useAppDispatch();

  const currentIndex = STEP_ORDER.indexOf(step);

  const goNext = useCallback(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      const nextStep = STEP_ORDER[nextIndex];
      if (nextStep) {
        setStep(nextStep);
      }
    }
  }, [currentIndex]);

  const handleComplete = useCallback(async () => {
    try {
      await invoke('set_onboarding_complete');
    } catch {
      // Backend not ready — still mark complete in UI state
    }
    dispatch({ type: 'SET_ONBOARDING_COMPLETE' });
  }, [dispatch]);

  // Render steps — using placeholder UI until Phase 4 ports the real components
  return (
    <div className="h-screen flex flex-col items-center justify-center"
         style={{ backgroundColor: '#0B0E11', color: '#EEF1F4' }}>
      {step === 'splash' && (
        <div className="text-center space-y-6">
          <h1 className="text-3xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            This is your Semblance.
          </h1>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            A digital representation that understands your world.
          </p>
          <button
            type="button"
            onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}
          >
            Begin
          </button>
        </div>
      )}

      {step === 'hardware' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            Detecting your hardware...
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Semblance will recommend the best model for your machine.
          </p>
          {/* TODO: Phase 4 — HardwareDetection component with detect_hardware IPC */}
          <button type="button" onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Continue
          </button>
        </div>
      )}

      {step === 'data-sources' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            Connect your world
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Choose which data sources to connect. You can always change this later.
          </p>
          {/* TODO: Phase 4 — DataSourcesStep component */}
          <button type="button" onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Continue
          </button>
        </div>
      )}

      {step === 'autonomy' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            How much autonomy?
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Choose how much Semblance can do on your behalf.
          </p>
          {/* TODO: Phase 4 — AutonomyTier component wrapping AutonomySelector */}
          <button type="button" onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Continue
          </button>
        </div>
      )}

      {step === 'naming-moment' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            What should it call you?
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Your name, a nickname, whatever feels right.
          </p>
          {/* TODO: Phase 4 — NamingMoment component with set_user_name IPC */}
          <button type="button" onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Continue
          </button>
        </div>
      )}

      {step === 'naming-ai' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            What will you call it?
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Give your Semblance a name.
          </p>
          {/* TODO: Phase 4 — NamingYourAI component */}
          <button type="button" onClick={goNext}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Continue
          </button>
        </div>
      )}

      {step === 'initialize' && (
        <div className="text-center space-y-6">
          <h2 className="text-xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            Initializing your Semblance...
          </h2>
          <p className="text-sm" style={{ color: '#8593A4' }}>
            Downloading models and building your knowledge graph.
          </p>
          {/* TODO: Phase 4 — InitializeStep component with model download + knowledge moment */}
          <button type="button" onClick={handleComplete}
            className="px-6 py-3 rounded-lg text-sm"
            style={{ backgroundColor: '#6ECFA3', color: '#0B0E11' }}>
            Start
          </button>
        </div>
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
