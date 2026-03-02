// Intent Onboarding — Structural tests for IntentCapture step integration
// in the OnboardingFlow, verifying step ordering, imports, and component wiring.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

const onboardingFlow = readFile('packages/desktop/src/screens/OnboardingFlow.tsx');

// ─── Step Type & Order ─────────────────────────────────────────────────────

describe('Intent onboarding — step type and order', () => {
  it("includes 'intent-capture' in OnboardingStep type", () => {
    expect(onboardingFlow).toContain("'intent-capture'");
  });

  it("STEP_ORDER includes 'intent-capture' between 'autonomy' and 'naming-moment'", () => {
    // Extract the STEP_ORDER array from source
    const stepOrderMatch = onboardingFlow.match(/const STEP_ORDER[^=]*=\s*\[([\s\S]*?)\];/);
    expect(stepOrderMatch).not.toBeNull();
    const stepOrderBlock = stepOrderMatch![1]!;
    const steps = stepOrderBlock
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);
    const autonomyIdx = steps.indexOf('autonomy');
    const intentIdx = steps.indexOf('intent-capture');
    const namingIdx = steps.indexOf('naming-moment');
    expect(intentIdx).toBeGreaterThan(autonomyIdx);
    expect(intentIdx).toBeLessThan(namingIdx);
  });
});

// ─── Imports ───────────────────────────────────────────────────────────────

describe('Intent onboarding — imports', () => {
  it('imports IntentCapture from @semblance/ui', () => {
    expect(onboardingFlow).toContain('IntentCapture');
    // Verify it comes from the UI library import block
    const uiImportMatch = onboardingFlow.match(/import\s*\{[^}]*IntentCapture[^}]*\}\s*from\s*['"]@semblance\/ui['"]/);
    expect(uiImportMatch).not.toBeNull();
  });

  it('imports setIntentOnboarding from ipc/commands', () => {
    expect(onboardingFlow).toContain('setIntentOnboarding');
    const commandsImportMatch = onboardingFlow.match(/import\s*\{[^}]*setIntentOnboarding[^}]*\}\s*from\s*['"]\.\.\/ipc\/commands['"]/);
    expect(commandsImportMatch).not.toBeNull();
  });
});

// ─── Callback & Render ─────────────────────────────────────────────────────

describe('Intent onboarding — callback and rendering', () => {
  it('defines handleIntentCapture callback', () => {
    expect(onboardingFlow).toContain('handleIntentCapture');
  });

  it('renders IntentCapture component for intent-capture step', () => {
    expect(onboardingFlow).toContain('<IntentCapture');
    // Verify it's rendered within the intent-capture step conditional
    expect(onboardingFlow).toContain("step === 'intent-capture'");
  });
});

// ─── semblance-ui Component Files ──────────────────────────────────────────

describe('Intent onboarding — semblance-ui components', () => {
  it('IntentCapture.web.tsx exists in semblance-ui', () => {
    const filePath = join(ROOT, 'packages/semblance-ui/pages/Onboarding/IntentCapture.web.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it('IntentCapture.types.ts exports IntentCaptureProps', () => {
    const typesFile = readFile('packages/semblance-ui/pages/Onboarding/IntentCapture.types.ts');
    expect(typesFile).toContain('IntentCaptureProps');
    expect(typesFile).toContain('export');
  });
});
