// Integration: Step 9 Onboarding — Updated flow with runtime setup stages.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ONBOARDING = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingFlow.tsx');
const SETTINGS = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'SettingsScreen.tsx');
const HW_DISPLAY = join(ROOT, 'packages', 'desktop', 'src', 'components', 'HardwareProfileDisplay.tsx');
const DL_PROGRESS = join(ROOT, 'packages', 'desktop', 'src', 'components', 'ModelDownloadProgress.tsx');

describe('Step 9: Onboarding Flow Updates', () => {
  const content = readFileSync(ONBOARDING, 'utf-8');

  it('has 7-step STEP_ORDER sequence', () => {
    expect(content).toContain('STEP_ORDER');
    // Count the 7 steps
    expect(content).toContain("'splash'");
    expect(content).toContain("'hardware'");
    expect(content).toContain("'data-sources'");
    expect(content).toContain("'autonomy'");
    expect(content).toContain("'naming-moment'");
    expect(content).toContain("'naming-ai'");
    expect(content).toContain("'initialize'");
  });

  it('imports HardwareDetection from semblance-ui', () => {
    expect(content).toContain('HardwareDetection');
  });

  it('imports InitializeStep for model downloads from semblance-ui', () => {
    expect(content).toContain('InitializeStep');
  });

  it('has hardware detection step with detectHardware IPC call', () => {
    expect(content).toContain("step === 'hardware'");
    expect(content).toContain('detectHardware');
  });

  it('has initialize step with model downloads', () => {
    expect(content).toContain("step === 'initialize'");
    expect(content).toContain('startModelDownloads');
  });

  it('has data-sources step for connectors', () => {
    expect(content).toContain("step === 'data-sources'");
    expect(content).toContain('DataSourcesStep');
  });

  it('has autonomy step with AutonomyTierStep', () => {
    expect(content).toContain("step === 'autonomy'");
    expect(content).toContain('AutonomyTierStep');
  });

  it('naming steps are separate (user name + AI name)', () => {
    expect(content).toContain("step === 'naming-moment'");
    expect(content).toContain("step === 'naming-ai'");
    expect(content).toContain('NamingMoment');
    expect(content).toContain('NamingYourAI');
  });

  it('no references to Ollama in onboarding', () => {
    expect(content).not.toContain('Ollama not connected');
    expect(content).not.toContain('Make sure Ollama is running');
  });

  it('generates knowledge moment during initialize step', () => {
    expect(content).toContain('generateKnowledgeMoment');
    expect(content).toContain('knowledgeMoment');
  });
});

describe('Step 9: Settings AI Engine Section', () => {
  const content = readFileSync(SETTINGS, 'utf-8');
  const aiEngineSrc = readFileSync(join(ROOT, 'packages', 'semblance-ui', 'components', 'Settings', 'SettingsAIEngine.web.tsx'), 'utf-8');

  it('SettingsScreen delegates to SettingsNavigator', () => {
    expect(content).toContain("import { SettingsNavigator }");
    expect(content).toContain('<SettingsNavigator');
  });

  it('no longer has standalone AI Model section', () => {
    const aiModelSectionRegex = />AI Model</;
    expect(aiModelSectionRegex.test(content)).toBe(false);
  });

  it('AI Engine sub-screen has model and hardware configuration', () => {
    expect(aiEngineSrc).toContain('modelName');
    expect(aiEngineSrc).toContain('hardwareProfile');
    expect(aiEngineSrc).toContain('gpuAcceleration');
  });

  it('SettingsScreen passes hardware profile', () => {
    expect(content).toContain('hardwareProfile');
  });

  it('calls detectHardware on load', () => {
    expect(content).toContain('detectHardware');
  });

  it('passes model running status to SettingsNavigator', () => {
    expect(content).toContain('isModelRunning');
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
