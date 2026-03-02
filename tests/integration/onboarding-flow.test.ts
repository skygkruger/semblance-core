/**
 * Onboarding Flow Integration Tests
 *
 * Static analysis validating:
 * - Desktop OnboardingFlow.tsx references all 7 steps
 * - Mobile OnboardingFlow.tsx references all 7 steps
 * - Desktop OnboardingFlow references set_onboarding_complete IPC command
 * - Both flows have step state management (useState)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DESKTOP_ONBOARDING = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingFlow.tsx');
const MOBILE_ONBOARDING = join(ROOT, 'packages', 'mobile', 'src', 'screens', 'OnboardingFlow.tsx');

const STEP_IDENTIFIERS = [
  'SplashScreen',
  'HardwareDetection',
  'DataSourcesStep',
  'AutonomyTier',
  'NamingMoment',
  'NamingYourAI',
  'InitializeStep',
];

describe('Onboarding Flow — Step Coverage', () => {
  it('desktop OnboardingFlow.tsx references all 7 steps', () => {
    expect(existsSync(DESKTOP_ONBOARDING)).toBe(true);
    const content = readFileSync(DESKTOP_ONBOARDING, 'utf-8');

    for (const step of STEP_IDENTIFIERS) {
      expect(content).toContain(step);
    }
  });

  it('mobile OnboardingFlow.tsx references all 7 steps', () => {
    expect(existsSync(MOBILE_ONBOARDING)).toBe(true);
    const content = readFileSync(MOBILE_ONBOARDING, 'utf-8');

    for (const step of STEP_IDENTIFIERS) {
      expect(content).toContain(step);
    }
  });

  it('desktop OnboardingFlow references setOnboardingComplete IPC command', () => {
    const content = readFileSync(DESKTOP_ONBOARDING, 'utf-8');
    // The desktop flow imports and calls setOnboardingComplete from ipc/commands
    expect(content).toContain('setOnboardingComplete');
    // Verify it is imported from ipc/commands
    expect(content).toContain("from '../ipc/commands'");
  });

  it('both flows use useState for step state management', () => {
    const desktopContent = readFileSync(DESKTOP_ONBOARDING, 'utf-8');
    const mobileContent = readFileSync(MOBILE_ONBOARDING, 'utf-8');

    // Both should use useState with OnboardingStep type
    expect(desktopContent).toContain('useState');
    expect(desktopContent).toContain('OnboardingStep');
    expect(desktopContent).toContain('STEP_ORDER');

    expect(mobileContent).toContain('useState');
    expect(mobileContent).toContain('OnboardingStep');
    expect(mobileContent).toContain('STEP_ORDER');
  });
});
