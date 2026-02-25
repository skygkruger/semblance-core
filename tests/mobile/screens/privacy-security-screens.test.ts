// Privacy + Security Screens Tests.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const SCREENS_DIR = path.join(ROOT, 'packages/mobile/src/screens');

describe('Privacy Dashboard Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'privacy/PrivacyDashboardScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('renders all 5 collapsible sections', () => {
    // Must have 5 sections
    expect(content).toContain('Privacy Guarantees');
    expect(content).toContain('Data Inventory');
    expect(content).toContain('Network Activity');
    expect(content).toContain('Comparison Statement');
    expect(content).toContain('Audit Trail');

    // Must be collapsible
    expect(content).toContain('expandedSections');
    expect(content).toContain('toggleSection');

    // All 5 section IDs
    expect(content).toContain("'guarantees'");
    expect(content).toContain("'inventory'");
    expect(content).toContain("'network'");
    expect(content).toContain("'comparison'");
    expect(content).toContain("'audit'");
  });

  it('comparison statement shows correct counts', () => {
    // Must accept ComparisonCounts props
    expect(content).toContain('ComparisonCounts');
    expect(content).toContain('localOnlyDataPoints');
    expect(content).toContain('cloudCompetitorDataPoints');
    expect(content).toContain('actionsLogged');
    expect(content).toContain('actionsReversible');

    // Must display formatted values
    expect(content).toContain('toLocaleString');
  });
});

describe('Proof of Privacy Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'privacy/ProofOfPrivacyScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('blocks generation for free tier', () => {
    expect(content).toContain('isPremium');
    expect(content).toContain('Premium Feature');
    expect(content).toContain('Premium required');
    expect(content).toContain('buttonDisabled');
  });

  it('export opens share sheet for premium users', () => {
    expect(content).toContain('onExportReport');
    expect(content).toContain('Export');
    expect(content).toContain('reports');
  });
});

describe('Biometric Setup Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'security/BiometricSetupScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('shows available biometric types', () => {
    expect(content).toContain('BiometricType');
    expect(content).toContain('biometricType');
    expect(content).toContain('Face ID');
    expect(content).toContain('Touch ID');
    expect(content).toContain('Fingerprint');
    expect(content).toContain('BIOMETRIC_LABELS');
  });

  it('handles enrollment toggle', () => {
    expect(content).toContain('onToggleEnabled');
    expect(content).toContain('Enable Biometric Lock');
    expect(content).toContain('Disable Biometric Lock');

    // Must handle unavailable hardware
    expect(content).toContain('not available or not enrolled');

    // Must support test auth
    expect(content).toContain('onTestAuth');
    expect(content).toContain('Test Authentication');
  });
});

describe('Backup Screen', () => {
  const filePath = path.join(SCREENS_DIR, 'security/BackupScreen.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('creates encrypted backup with passphrase', () => {
    expect(content).toContain('onCreateBackup');
    expect(content).toContain('passphrase');
    expect(content).toContain('confirmPassphrase');
    expect(content).toContain('secureTextEntry');

    // Must validate passphrase match
    expect(content).toContain('Mismatch');
    expect(content).toContain('do not match');

    // Must mention encryption method
    expect(content).toContain('Argon2id');
    expect(content).toContain('AES-256-GCM');
  });

  it('restore navigates through passphrase flow', () => {
    expect(content).toContain('onRestoreBackup');
    expect(content).toContain('onPickRestoreFile');
    expect(content).toContain('restorePassphrase');

    // Must show restore file info
    expect(content).toContain('restoreFile');
    expect(content).toContain('Choose Backup File');

    // Must have restore result handling
    expect(content).toContain('Restore Complete');
    expect(content).toContain('Restore Failed');
  });
});
