/**
 * Onboarding Flow — Cinematic first-run experience.
 * This is the most emotionally important flow in the product.
 * Uses DM Serif Display, --duration-cinematic timing, crossfade transitions.
 *
 * 8 screens: Welcome → Promise → Naming → Data Connection → File Selection →
 * Knowledge Moment → Autonomy → Ready
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button, Input, AutonomySelector, ProgressBar } from '@semblance/ui';
import { useAppState, useAppDispatch } from '../state/AppState';
import type { AutonomyTier } from '@semblance/ui';

const TOTAL_STEPS = 8;

export function OnboardingScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [step, setStep] = useState(state.onboardingStep);
  const [nameInput, setNameInput] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [autonomyTier, setAutonomyTier] = useState<AutonomyTier>('partner');
  const [visible, setVisible] = useState(true);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            <h2 className="font-display text-3xl mb-8">What would you like to call it?</h2>
            {nameConfirmed ? (
              <p className="text-2xl font-semibold text-semblance-accent animate-fade-in">
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

        {/* Step 3: Data Connection */}
        {step === 3 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              Let&apos;s connect <span className="text-semblance-accent">{name}</span> to your world.
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

              {/* Email — coming soon */}
              <div className="p-5 rounded-lg border border-semblance-border-dark/30 opacity-50">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-semblance-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span className="font-semibold text-semblance-muted">Email</span>
                  <span className="text-xs text-semblance-muted ml-auto">Coming in the next update</span>
                </div>
              </div>

              {/* Calendar — coming soon */}
              <div className="p-5 rounded-lg border border-semblance-border-dark/30 opacity-50">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-semblance-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
                  </svg>
                  <span className="font-semibold text-semblance-muted">Calendar</span>
                  <span className="text-xs text-semblance-muted ml-auto">Coming in the next update</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: File Selection */}
        {step === 4 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              Choose folders for <span className="text-semblance-accent">{name}</span> to learn from.
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
              <Button variant="secondary" onClick={handleFileSelection}>
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

        {/* Step 5: Knowledge Moment */}
        {step === 5 && (
          <div>
            <h2 className="font-display text-3xl mb-6">
              <span className="text-semblance-accent">{name}</span> is exploring your documents...
            </h2>
            <ProgressBar indeterminate className="max-w-sm mx-auto mb-8" />
            <p className="text-sm text-semblance-text-secondary-dark mb-6">
              {state.knowledgeStats.documentCount > 0
                ? `${name} found ${state.knowledgeStats.documentCount} documents and ${state.knowledgeStats.chunkCount} passages to learn from.`
                : 'Scanning and indexing your files...'}
            </p>
            <Button onClick={advance} variant="ghost">Continue</Button>
          </div>
        )}

        {/* Step 6: Autonomy */}
        {step === 6 && (
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <h2 className="font-display text-3xl mb-2">
              How much should <span className="text-semblance-accent">{name}</span> do on its own?
            </h2>
            <p className="text-sm text-semblance-text-secondary-dark mb-8">You can change this anytime in Settings.</p>

            <div className="max-w-md mx-auto text-left">
              <AutonomySelector value={autonomyTier} onChange={setAutonomyTier} />
            </div>

            <div className="mt-8">
              <Button onClick={advance}>Continue</Button>
            </div>
          </div>
        )}

        {/* Step 7: Ready */}
        {step === 7 && (
          <div>
            <h1 className="font-display text-display leading-tight mb-4">
              <span className="text-semblance-accent">{name}</span> is ready.
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
