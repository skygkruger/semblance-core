// Security Pass Validation — Comprehensive integration test for the security hardening pass.
//
// Verifies structural contracts across all phases:
// Phase 2: KeychainStore interface, MIGRATED_SENTINEL, service naming
// Phase 3: Protected features, biometric reasons, per-activation features
// Phase 4: Migration runner, terms step in onboarding
//
// Does NOT test runtime behavior (that's in unit tests) — this validates
// the cross-package contracts are correct and consistent.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('Security Pass — Phase 2: OS Keychain Migration', () => {
  it('KeychainStore interface exists in packages/core/credentials/', () => {
    const path = join(ROOT, 'packages/core/credentials/keychain.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('Desktop KeychainStore implementation exists', () => {
    const path = join(ROOT, 'packages/desktop/src/credentials/desktop-keychain-store.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('Mobile KeychainStore implementation exists', () => {
    const path = join(ROOT, 'packages/mobile/src/credentials/keychain.native.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('Keychain migration runner exists in gateway', () => {
    const path = join(ROOT, 'packages/gateway/credentials/keychain-migration.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('KeychainStore interface exports set, get, delete, clear', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/credentials/keychain.ts'),
      'utf-8',
    );
    expect(source).toContain('set(service: string, account: string, value: string)');
    expect(source).toContain('get(service: string, account: string)');
    expect(source).toContain('delete(service: string, account: string)');
    expect(source).toContain('clear(servicePrefix: string)');
  });

  it('MIGRATED_SENTINEL is defined and exported', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/credentials/keychain.ts'),
      'utf-8',
    );
    expect(source).toContain("MIGRATED_SENTINEL = 'MIGRATED_TO_KEYCHAIN'");
  });

  it('Desktop implementation uses Tauri stronghold', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/credentials/desktop-keychain-store.ts'),
      'utf-8',
    );
    expect(source).toContain('plugin:stronghold|set_record');
    expect(source).toContain('plugin:stronghold|get_record');
    expect(source).toContain('plugin:stronghold|delete_record');
  });

  it('Desktop implementation has tracking table', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/credentials/desktop-keychain-store.ts'),
      'utf-8',
    );
    expect(source).toContain('keychain_entries');
    expect(source).toContain('CREATE TABLE IF NOT EXISTS');
  });

  it('Mobile implementation uses kSecAttrAccessibleWhenUnlockedThisDeviceOnly', () => {
    const source = readFileSync(
      join(ROOT, 'packages/mobile/src/credentials/keychain.native.ts'),
      'utf-8',
    );
    expect(source).toContain('AccessibleWhenUnlockedThisDeviceOnly');
  });

  it('Migration runner marks entries with MIGRATED_SENTINEL', () => {
    const source = readFileSync(
      join(ROOT, 'packages/gateway/credentials/keychain-migration.ts'),
      'utf-8',
    );
    expect(source).toContain('MIGRATED_SENTINEL');
    expect(source).toContain('UPDATE service_credentials SET encrypted_password');
    expect(source).toContain('UPDATE oauth_tokens SET');
  });
});

describe('Security Pass — Phase 3: Biometric Protection Layer', () => {
  it('ProtectedFeature type has 6 features', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/auth/types.ts'),
      'utf-8',
    );
    const features = [
      'app_launch',
      'alter_ego_activation',
      'privacy_dashboard',
      'financial_screen',
      'health_screen',
      'digital_representative_activation',
    ];
    for (const f of features) {
      expect(source).toContain(`'${f}'`);
    }
  });

  it('BiometricAuth interface has isAvailable and authenticate', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/auth/types.ts'),
      'utf-8',
    );
    expect(source).toContain('isAvailable(): Promise<boolean>');
    expect(source).toContain('authenticate(reason: string): Promise<BiometricResult>');
  });

  it('PER_ACTIVATION_FEATURES is a ReadonlySet', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/auth/types.ts'),
      'utf-8',
    );
    expect(source).toContain('ReadonlySet<ProtectedFeature>');
  });

  it('BIOMETRIC_REASONS has entries for all 6 features', () => {
    const source = readFileSync(
      join(ROOT, 'packages/core/auth/types.ts'),
      'utf-8',
    );
    expect(source).toContain('app_launch:');
    expect(source).toContain('alter_ego_activation:');
    expect(source).toContain('privacy_dashboard:');
    expect(source).toContain('financial_screen:');
    expect(source).toContain('health_screen:');
    expect(source).toContain('digital_representative_activation:');
  });

  it('Desktop BiometricAuth adapter exists', () => {
    expect(existsSync(join(ROOT, 'packages/desktop/src/auth/biometric.ts'))).toBe(true);
  });

  it('Mobile BiometricAuth adapter exists', () => {
    expect(existsSync(join(ROOT, 'packages/mobile/src/auth/biometric.ts'))).toBe(true);
  });

  it('Desktop SessionAuthState exists', () => {
    expect(existsSync(join(ROOT, 'packages/desktop/src/auth/session.ts'))).toBe(true);
  });

  it('Mobile SessionAuthState exists', () => {
    expect(existsSync(join(ROOT, 'packages/mobile/src/auth/session.ts'))).toBe(true);
  });

  it('Desktop BiometricGate exists', () => {
    expect(existsSync(join(ROOT, 'packages/desktop/src/auth/BiometricGate.tsx'))).toBe(true);
  });

  it('Mobile BiometricGate exists', () => {
    expect(existsSync(join(ROOT, 'packages/mobile/src/auth/BiometricGate.tsx'))).toBe(true);
  });

  it('useFeatureAuth hook exists in semblance-ui', () => {
    expect(existsSync(join(ROOT, 'packages/semblance-ui/hooks/useFeatureAuth.ts'))).toBe(true);
  });

  it('SessionAuthState is in-memory only (no persistence)', () => {
    const desktopSource = readFileSync(
      join(ROOT, 'packages/desktop/src/auth/session.ts'),
      'utf-8',
    );
    // Should NOT import any storage, file, or database modules
    expect(desktopSource).not.toContain('import.*sqlite');
    expect(desktopSource).not.toContain('import.*fs');
    expect(desktopSource).not.toContain('localStorage');
    expect(desktopSource).not.toContain('AsyncStorage');
    // Should contain the "NEVER persisted" comment
    expect(desktopSource).toContain('NEVER persisted');
  });

  it('Desktop biometric auto-passes on Linux', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/auth/biometric.ts'),
      'utf-8',
    );
    expect(source).toContain("platform === 'linux'");
    expect(source).toContain('return false'); // isAvailable returns false on Linux
  });

  it('useFeatureAuth checks session state before prompting', () => {
    const source = readFileSync(
      join(ROOT, 'packages/semblance-ui/hooks/useFeatureAuth.ts'),
      'utf-8',
    );
    // Session check comes before biometric prompt
    const sessionCheckIndex = source.indexOf('sessionAuth.isAuthenticated');
    const biometricPromptIndex = source.indexOf('biometricAuth.authenticate');
    expect(sessionCheckIndex).toBeGreaterThan(-1);
    expect(biometricPromptIndex).toBeGreaterThan(-1);
    expect(sessionCheckIndex).toBeLessThan(biometricPromptIndex);
  });
});

describe('Security Pass — Phase 4: Pre-Launch Infrastructure', () => {
  it('UpgradeEmailCapture component exists (web)', () => {
    expect(existsSync(join(ROOT, 'packages/semblance-ui/components/UpgradeEmailCapture/UpgradeEmailCapture.web.tsx'))).toBe(true);
  });

  it('UpgradeEmailCapture component exists (native)', () => {
    expect(existsSync(join(ROOT, 'packages/semblance-ui/components/UpgradeEmailCapture/UpgradeEmailCapture.native.tsx'))).toBe(true);
  });

  it('TermsAcceptanceStep exists (web)', () => {
    expect(existsSync(join(ROOT, 'packages/semblance-ui/pages/Onboarding/TermsAcceptanceStep.web.tsx'))).toBe(true);
  });

  it('TermsAcceptanceStep exists (native)', () => {
    expect(existsSync(join(ROOT, 'packages/semblance-ui/pages/Onboarding/TermsAcceptanceStep.native.tsx'))).toBe(true);
  });

  it('Desktop migration runner exists', () => {
    expect(existsSync(join(ROOT, 'packages/desktop/src/migrations/index.ts'))).toBe(true);
  });

  it('Mobile migration runner exists', () => {
    expect(existsSync(join(ROOT, 'packages/mobile/src/migrations/index.ts'))).toBe(true);
  });

  it('Desktop OnboardingFlow includes terms step', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/screens/OnboardingFlow.tsx'),
      'utf-8',
    );
    expect(source).toContain("'terms'");
    expect(source).toContain('TermsAcceptanceStep');
  });

  it('Mobile OnboardingFlow includes terms step', () => {
    const source = readFileSync(
      join(ROOT, 'packages/mobile/src/screens/OnboardingFlow.tsx'),
      'utf-8',
    );
    expect(source).toContain("'terms'");
    expect(source).toContain('TermsAcceptanceStep');
  });

  it('Desktop STEP_ORDER has 10 entries', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/screens/OnboardingFlow.tsx'),
      'utf-8',
    );
    // Count step entries in STEP_ORDER array
    const stepOrderMatch = source.match(/const STEP_ORDER[\s\S]*?\];/);
    expect(stepOrderMatch).not.toBeNull();
    const steps = stepOrderMatch![0].match(/'/g);
    // 10 steps, each quoted = 20 quote marks (10 pairs)
    expect(steps!.length).toBe(20);
  });

  it('Terms step is the last in STEP_ORDER', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/screens/OnboardingFlow.tsx'),
      'utf-8',
    );
    const stepOrderMatch = source.match(/const STEP_ORDER[\s\S]*?\];/);
    expect(stepOrderMatch).not.toBeNull();
    const stepText = stepOrderMatch![0];
    const termsIndex = stepText.lastIndexOf("'terms'");
    const lastBracket = stepText.lastIndexOf(']');
    // 'terms' should be the last entry before closing bracket
    expect(termsIndex).toBeGreaterThan(-1);
    expect(termsIndex).toBeLessThan(lastBracket);
    // No other step appears after 'terms'
    const afterTerms = stepText.slice(termsIndex + "'terms'".length, lastBracket);
    expect(afterTerms.match(/'[a-z-]+'/)).toBeNull();
  });

  it('Desktop migration runner has _migrations table schema', () => {
    const source = readFileSync(
      join(ROOT, 'packages/desktop/src/migrations/index.ts'),
      'utf-8',
    );
    expect(source).toContain('_migrations');
    expect(source).toContain('version TEXT PRIMARY KEY');
    expect(source).toContain('description TEXT NOT NULL');
    expect(source).toContain('applied_at TEXT NOT NULL');
  });

  it('Mobile migration runner exports MigrationDatabase interface', () => {
    const source = readFileSync(
      join(ROOT, 'packages/mobile/src/migrations/index.ts'),
      'utf-8',
    );
    expect(source).toContain('export interface MigrationDatabase');
    expect(source).toContain('exec(sql: string)');
    expect(source).toContain('prepare(sql: string)');
  });

  it('UpgradeEmailCapture does not persist email', () => {
    const source = readFileSync(
      join(ROOT, 'packages/semblance-ui/components/UpgradeEmailCapture/UpgradeEmailCapture.web.tsx'),
      'utf-8',
    );
    // Should NOT reference localStorage, AsyncStorage, or any storage API
    expect(source).not.toContain('localStorage');
    expect(source).not.toContain('AsyncStorage');
    expect(source).not.toContain('sessionStorage');
    expect(source).not.toContain('writeFile');
    expect(source).not.toContain('fs.');
  });

  it('semblance-ui index exports TermsAcceptanceStep', () => {
    const source = readFileSync(
      join(ROOT, 'packages/semblance-ui/index.ts'),
      'utf-8',
    );
    expect(source).toContain('TermsAcceptanceStep');
  });

  it('semblance-ui index exports UpgradeEmailCapture', () => {
    const source = readFileSync(
      join(ROOT, 'packages/semblance-ui/index.ts'),
      'utf-8',
    );
    expect(source).toContain('UpgradeEmailCapture');
  });

  it('semblance-ui index exports useFeatureAuth', () => {
    const source = readFileSync(
      join(ROOT, 'packages/semblance-ui/index.ts'),
      'utf-8',
    );
    expect(source).toContain('useFeatureAuth');
    expect(source).toContain('FeatureAuthContext');
  });
});
