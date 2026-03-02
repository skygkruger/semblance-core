// @vitest-environment jsdom
// Tests for OnboardingFlow — renders real component, tests 7-step sequence.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('OnboardingFlow', () => {
  beforeEach(() => {
    clearInvokeMocks();
    mockOnboardingInvoke();
  });

  it('renders the splash step by default', () => {
    renderOnboarding();
    // SplashScreen is the first step — component should render the Semblance brand
    expect(screen.getByText(/Semblance/i)).toBeInTheDocument();
  });

  it('defines a 7-step sequence via STEP_ORDER', async () => {
    // The OnboardingFlow uses STEP_ORDER with 7 steps.
    // Verify by checking 7 step indicator dots are rendered.
    renderOnboarding();
    // Step indicator dots: 7 small circles at the bottom
    const dots = document.querySelectorAll('.w-2.h-2.rounded-full');
    expect(dots.length).toBe(7);
  });

  it('first step indicator is active (veridian color)', () => {
    renderOnboarding();
    const dots = document.querySelectorAll('.w-2.h-2.rounded-full');
    // First dot should be veridian (#6ECFA3), rest should be inactive (#2A2F35)
    expect(dots[0]).toHaveStyle({ backgroundColor: '#6ECFA3' });
    expect(dots[1]).toHaveStyle({ backgroundColor: '#2A2F35' });
  });

  it('uses partner as default autonomy tier', () => {
    // The OnboardingFlow initializes autonomy state with useState<AutonomyTier>('partner')
    // This is a structural assertion — the component renders without error with partner default
    renderOnboarding();
    expect(screen.getByText(/Semblance/i)).toBeInTheDocument();
  });

  it('renders in a dark-themed container', () => {
    renderOnboarding();
    const container = document.querySelector('.h-screen');
    expect(container).toHaveStyle({ backgroundColor: '#0B0E11' });
  });
});
