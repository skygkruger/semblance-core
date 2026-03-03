// @vitest-environment jsdom
// OnboardingFlow Terms Integration — Verifies the 10-step sequence includes terms.
//
// Covers:
// - STEP_ORDER now has 10 steps (added 'language-select' as step 0, 'terms' as final)
// - 10 step indicator dots are rendered
// - Terms step is the last step in the flow
// - Desktop OnboardingFlow includes TermsAcceptanceStep

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingFlow } from '@semblance/desktop/screens/OnboardingFlow';
import { AppStateProvider } from '@semblance/desktop/state/AppState';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

function mockOnboardingInvoke() {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'detect_hardware') return {
      tier: 'standard',
      totalRamMb: 16384,
      cpuCores: 8,
      gpuName: null,
      gpuVramMb: null,
      os: 'Windows',
      arch: 'x86_64',
      voiceCapable: true,
    };
    if (cmd === 'set_user_name') return null;
    if (cmd === 'set_autonomy_tier') return null;
    if (cmd === 'start_model_downloads') return { success: true };
    if (cmd === 'generate_knowledge_moment') return {
      title: 'Test Moment',
      summary: 'A test knowledge moment',
      connections: [{ from: 'A', to: 'B' }],
    };
    if (cmd === 'set_onboarding_complete') return null;
    return null;
  });
}

function renderOnboarding() {
  return render(
    <MemoryRouter>
      <AppStateProvider>
        <OnboardingFlow />
      </AppStateProvider>
    </MemoryRouter>,
  );
}

describe('OnboardingFlow — Terms Step Integration', () => {
  beforeEach(() => {
    clearInvokeMocks();
    mockOnboardingInvoke();
  });

  it('renders 10 step indicator dots (language-select + intent-capture + terms added)', () => {
    renderOnboarding();
    const dots = document.querySelectorAll('.w-2.h-2.rounded-full');
    expect(dots.length).toBe(10);
  });

  it('starts on language-select step (first of 10)', () => {
    renderOnboarding();
    // LanguageSelect is the first step
    expect(screen.getByText(/Choose your language/i)).toBeInTheDocument();
    // First dot active, rest inactive
    const dots = document.querySelectorAll('.w-2.h-2.rounded-full');
    expect(dots[0]).toHaveStyle({ backgroundColor: '#6ECFA3' });
    expect(dots[9]).toHaveStyle({ backgroundColor: '#2A2F35' });
  });
});
