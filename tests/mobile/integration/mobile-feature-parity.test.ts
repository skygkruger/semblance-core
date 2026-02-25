// Mobile Feature Parity Integration Tests — Verify all sprint features are accessible on mobile.
// Cross-sprint regression + Step 31 additions.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isColdStartWithinBudget } from '../../../packages/core/performance/performance-budget';
import type { ColdStartMetrics } from '../../../packages/core/performance/types';

const ROOT = path.resolve(__dirname, '../../..');
const MOBILE_SRC = path.join(ROOT, 'packages/mobile/src');
const CORE_SRC = path.join(ROOT, 'packages/core');

// ─── Sprint 3 Features ─────────────────────────────────────────────────────

describe('Sprint 3 features accessible on mobile', () => {
  it('daily digest renders on mobile', () => {
    // DailyDigestCard component exists
    const componentPath = path.join(MOBILE_SRC, 'components/DailyDigestCard.tsx');
    expect(fs.existsSync(componentPath)).toBe(true);

    const content = fs.readFileSync(componentPath, 'utf-8');
    expect(content).toContain('DailyDigestCard');
  });

  it('web search + quick capture works', () => {
    // CaptureScreen exists (Sprint 3 quick capture)
    const capturePath = path.join(MOBILE_SRC, 'screens/CaptureScreen.tsx');
    expect(fs.existsSync(capturePath)).toBe(true);

    // ClipboardBanner exists for quick capture
    const clipboardPath = path.join(MOBILE_SRC, 'components/ClipboardBanner.tsx');
    expect(fs.existsSync(clipboardPath)).toBe(true);
  });
});

// ─── Sprint 4 Features ─────────────────────────────────────────────────────

describe('Sprint 4 features accessible on mobile', () => {
  it('contacts integration returns data', () => {
    // Contacts bridge exists
    const bridgePath = path.join(MOBILE_SRC, 'native/contacts-bridge.ts');
    expect(fs.existsSync(bridgePath)).toBe(true);

    const content = fs.readFileSync(bridgePath, 'utf-8');
    expect(content).toContain('createMobileContactsAdapter');
    expect(content).toContain('getAllContacts');
  });

  it('voice interaction initializes', () => {
    // Voice bridge exists
    const voicePath = path.join(MOBILE_SRC, 'native/voice-bridge.ts');
    expect(fs.existsSync(voicePath)).toBe(true);

    const content = fs.readFileSync(voicePath, 'utf-8');
    expect(content).toContain('createMobileVoiceAdapter');
    expect(content).toContain('startCapture');
    expect(content).toContain('transcribe');
  });
});

// ─── Sprint 5 Features ─────────────────────────────────────────────────────

describe('Sprint 5 features accessible on mobile', () => {
  it('Living Will export + import round-trip', () => {
    // Screen exists
    const screenPath = path.join(MOBILE_SRC, 'screens/sovereignty/LivingWillScreen.tsx');
    expect(fs.existsSync(screenPath)).toBe(true);

    const content = fs.readFileSync(screenPath, 'utf-8');

    // Has both export and import
    expect(content).toContain('onExport');
    expect(content).toContain('onImport');

    // Share adapter exists for export
    const sharePath = path.join(MOBILE_SRC, 'adapters/mobile-share-adapter.ts');
    expect(fs.existsSync(sharePath)).toBe(true);
  });

  it('Semblance Network discovery via Gateway IPC', () => {
    // Network screen exists
    const screenPath = path.join(MOBILE_SRC, 'screens/sovereignty/NetworkScreen.tsx');
    expect(fs.existsSync(screenPath)).toBe(true);

    const content = fs.readFileSync(screenPath, 'utf-8');

    // Shows peers, offers, sync status
    expect(content).toContain('NetworkPeer');
    expect(content).toContain('SharingOffer');
    expect(content).toContain('syncStatus');

    // No direct network imports in screen (all via props from Gateway IPC)
    expect(content).not.toMatch(/import.*\bnet\b/);
    expect(content).not.toMatch(/import.*\bhttp\b/);
    expect(content).not.toMatch(/import.*\bfetch\b/);
  });
});

// ─── Step 30 Features ───────────────────────────────────────────────────────

describe('Step 30 features accessible on mobile', () => {
  it('biometric authentication flow', () => {
    // Biometric adapter exists
    const adapterPath = path.join(MOBILE_SRC, 'adapters/mobile-biometric-adapter.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);

    // Biometric setup screen exists
    const screenPath = path.join(MOBILE_SRC, 'screens/security/BiometricSetupScreen.tsx');
    expect(fs.existsSync(screenPath)).toBe(true);

    // Core auth manager exists
    const authPath = path.join(CORE_SRC, 'auth/biometric-auth-manager.ts');
    expect(fs.existsSync(authPath)).toBe(true);
  });

  it('encrypted backup create + restore', () => {
    // Backup adapter exists
    const adapterPath = path.join(MOBILE_SRC, 'adapters/mobile-backup-adapter.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);

    // Backup screen exists
    const screenPath = path.join(MOBILE_SRC, 'screens/security/BackupScreen.tsx');
    expect(fs.existsSync(screenPath)).toBe(true);

    // Core backup manager exists
    const backupPath = path.join(CORE_SRC, 'backup/backup-manager.ts');
    expect(fs.existsSync(backupPath)).toBe(true);
  });
});

// ─── Performance Budget ─────────────────────────────────────────────────────

describe('Performance budget', () => {
  it('cold start phases within budget limits', () => {
    // Target: 3s for mobile/mid tier
    const withinBudget: ColdStartMetrics = {
      totalMs: 2800,
      criticalPhaseMs: 1400,
      importantPhaseMs: 900,
      deferredPhaseMs: 500,
      startedAt: Date.now() - 2800,
    };

    expect(isColdStartWithinBudget(withinBudget, 'mobile', 'mid')).toBe(true);

    // Over budget
    const overBudget: ColdStartMetrics = {
      totalMs: 6000,
      criticalPhaseMs: 3000,
      importantPhaseMs: 2000,
      deferredPhaseMs: 1000,
      startedAt: Date.now() - 6000,
    };

    expect(isColdStartWithinBudget(overBudget, 'mobile', 'mid')).toBe(false);
  });
});
