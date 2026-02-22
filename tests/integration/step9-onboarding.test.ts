// Integration: Step 9 Onboarding — Updated flow with runtime setup stages.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ONBOARDING = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingScreen.tsx');
const SETTINGS = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'SettingsScreen.tsx');
const HW_DISPLAY = join(ROOT, 'packages', 'desktop', 'src', 'components', 'HardwareProfileDisplay.tsx');
const DL_PROGRESS = join(ROOT, 'packages', 'desktop', 'src', 'components', 'ModelDownloadProgress.tsx');

describe('Step 9: Onboarding Flow Updates', () => {
  const content = readFileSync(ONBOARDING, 'utf-8');

  it('has 11 total steps', () => {
    expect(content).toContain('TOTAL_STEPS = 11');
  });

  it('imports HardwareProfileDisplay', () => {
    expect(content).toContain('HardwareProfileDisplay');
  });

  it('imports ModelDownloadProgress', () => {
    expect(content).toContain('ModelDownloadProgress');
  });

  it('has hardware detection step (step 3)', () => {
    expect(content).toContain('Step 3: Hardware Detection');
    expect(content).toContain('detect_hardware');
  });

  it('has model download consent step (step 4)', () => {
    expect(content).toContain('Step 4: Model Download Consent');
    expect(content).toContain('Download Models');
  });

  it('has model download progress step (step 5)', () => {
    expect(content).toContain('Step 5: Model Download Progress');
    expect(content).toContain('start_model_downloads');
  });

  it('data connection is now step 6', () => {
    expect(content).toContain('Step 6: Data Connection');
  });

  it('autonomy is now step 9', () => {
    expect(content).toContain('Step 9: Autonomy');
  });

  it('ready is now step 10', () => {
    expect(content).toContain('Step 10: Ready');
  });

  it('no references to Ollama in onboarding', () => {
    expect(content).not.toContain('Ollama not connected');
    expect(content).not.toContain('Make sure Ollama is running');
  });

  it('shows privacy messaging during model download consent', () => {
    expect(content).toContain('Nothing leaves your machine');
    expect(content).toContain('SHA-256');
  });
});

describe('Step 9: Settings AI Engine Section', () => {
  const content = readFileSync(SETTINGS, 'utf-8');

  it('has AI Engine section', () => {
    expect(content).toContain('AI Engine');
  });

  it('no longer has standalone AI Model section', () => {
    // Should not have "AI Model" as a section header (it's been replaced)
    // The exact old string was: <h2...>AI Model</h2>
    const aiModelSectionRegex = />AI Model</;
    expect(aiModelSectionRegex.test(content)).toBe(false);
  });

  it('has runtime selection (builtin/ollama/custom)', () => {
    expect(content).toContain("'builtin'");
    expect(content).toContain("'ollama'");
    expect(content).toContain("'custom'");
    expect(content).toContain('runtimeMode');
  });

  it('imports HardwareProfileDisplay', () => {
    expect(content).toContain('HardwareProfileDisplay');
  });

  it('calls detect_hardware on load', () => {
    expect(content).toContain("invoke<HardwareDisplayInfo>('detect_hardware')");
  });

  it('shows compact hardware display in builtin mode', () => {
    expect(content).toContain('compact');
  });
});

describe('Step 9: New Components', () => {
  it('HardwareProfileDisplay component exists', () => {
    expect(existsSync(HW_DISPLAY)).toBe(true);
    const content = readFileSync(HW_DISPLAY, 'utf-8');
    expect(content).toContain('export function HardwareProfileDisplay');
    expect(content).toContain('HardwareDisplayInfo');
    expect(content).toContain('HardwareProfileTier');
  });

  it('HardwareProfileDisplay has tier descriptions', () => {
    const content = readFileSync(HW_DISPLAY, 'utf-8');
    expect(content).toContain('TIER_LABELS');
    expect(content).toContain('TIER_DESCRIPTIONS');
    expect(content).toContain('constrained');
    expect(content).toContain('standard');
    expect(content).toContain('performance');
    expect(content).toContain('workstation');
  });

  it('HardwareProfileDisplay supports compact mode', () => {
    const content = readFileSync(HW_DISPLAY, 'utf-8');
    expect(content).toContain('compact');
  });

  it('ModelDownloadProgress component exists', () => {
    expect(existsSync(DL_PROGRESS)).toBe(true);
    const content = readFileSync(DL_PROGRESS, 'utf-8');
    expect(content).toContain('export function ModelDownloadProgress');
    expect(content).toContain('ModelDownloadState');
  });

  it('ModelDownloadProgress shows speed and ETA', () => {
    const content = readFileSync(DL_PROGRESS, 'utf-8');
    expect(content).toContain('formatBytes');
    expect(content).toContain('formatETA');
    expect(content).toContain('speedBytesPerSec');
  });

  it('ModelDownloadProgress supports retry on error', () => {
    const content = readFileSync(DL_PROGRESS, 'utf-8');
    expect(content).toContain('onRetry');
    expect(content).toContain('Retry');
  });
});
