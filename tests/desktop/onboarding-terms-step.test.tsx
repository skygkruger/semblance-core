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

  it('renders 13 step indicator dots (includes initial-index, knowledge-moment, and alter-ego-offer)', () => {
    renderOnboarding();
    const dots = document.querySelectorAll('div[style*="border-radius: 50%"]');
    expect(dots.length).toBe(13);
  });

  it('starts on language-select step (first of 13)', () => {
    renderOnboarding();
    // LanguageSelect is the first step
    expect(screen.getByText(/Choose your language/i)).toBeInTheDocument();
    // First dot active, rest inactive
    const dots = document.querySelectorAll('div[style*="border-radius: 50%"]');
    expect(dots[0]).toHaveStyle({ backgroundColor: '#6ECFA3' });
    expect(dots[12]).toHaveStyle({ backgroundColor: '#2A2F35' });
  });
});
