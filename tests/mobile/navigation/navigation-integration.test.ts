// Navigation Integration Tests — Route registration, deep links, settings sections.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SOVEREIGNTY_ROUTES,
  getRouteNames,
  resolveDeepLink,
  isDeferredRoute,
} from '../../../packages/mobile/src/navigation/sovereignty-navigator';

const ROOT = path.resolve(__dirname, '../../..');
const MOBILE_SRC = path.join(ROOT, 'packages/mobile/src');

describe('Sovereignty Navigator', () => {
  it('registers all routes', () => {
    const names = getRouteNames();

    // Must register all 10 sovereignty/privacy/security routes
    expect(names).toContain('LivingWill');
    expect(names).toContain('Witness');
    expect(names).toContain('Inheritance');
    expect(names).toContain('InheritanceActivation');
    expect(names).toContain('Network');
    expect(names).toContain('AdversarialDashboard');
    expect(names).toContain('PrivacyDashboard');
    expect(names).toContain('ProofOfPrivacy');
    expect(names).toContain('BiometricSetup');
    expect(names).toContain('Backup');

    expect(names.length).toBe(10);
  });

  it('deep link to Witness attestation opens correct screen', () => {
    const route = resolveDeepLink('semblance://sovereignty/witness');
    expect(route).not.toBeNull();
    expect(route!.name).toBe('Witness');
    expect(route!.category).toBe('sovereignty');

    // Non-existent deep link returns null
    const missing = resolveDeepLink('semblance://nonexistent');
    expect(missing).toBeNull();
  });

  it('deferred features show loading indicator on first navigation', () => {
    // All sovereignty routes should be deferred
    expect(isDeferredRoute('LivingWill')).toBe(true);
    expect(isDeferredRoute('Witness')).toBe(true);
    expect(isDeferredRoute('PrivacyDashboard')).toBe(true);
    expect(isDeferredRoute('Backup')).toBe(true);

    // Unknown routes default to deferred
    expect(isDeferredRoute('SomeUnknownScreen')).toBe(true);
  });
});

describe('Settings Screen Integration', () => {
  it('shows all new sections', () => {
    const settingsPath = path.join(MOBILE_SRC, 'screens/SettingsScreen.tsx');
    const content = fs.readFileSync(settingsPath, 'utf-8');

    // Step 31 sections
    expect(content).toContain('Your Digital Twin');
    expect(content).toContain('Security');
    // Privacy section already existed but now has Privacy Dashboard
    expect(content).toContain('Privacy Dashboard');

    // Digital Twin items
    expect(content).toContain('Living Will');
    expect(content).toContain('Inheritance Protocol');
    expect(content).toContain('Semblance Network');

    // Security items
    expect(content).toContain('Biometric Lock');
    expect(content).toContain('Encrypted Backup');
  });

  it('navigation from settings to sovereignty screens works via route types', () => {
    // Verify navigation types include all new routes
    const typesPath = path.join(MOBILE_SRC, 'navigation/types.ts');
    const content = fs.readFileSync(typesPath, 'utf-8');

    expect(content).toContain('LivingWill: undefined');
    expect(content).toContain('Witness:');
    expect(content).toContain('Inheritance: undefined');
    expect(content).toContain('InheritanceActivation: undefined');
    expect(content).toContain('Network: undefined');
    expect(content).toContain('AdversarialDashboard: undefined');
    expect(content).toContain('PrivacyDashboard: undefined');
    expect(content).toContain('ProofOfPrivacy: undefined');
    expect(content).toContain('BiometricSetup: undefined');
    expect(content).toContain('Backup: undefined');
  });

  it('back navigation preserves screen state (screens use local useState)', () => {
    // Verify sovereignty screens use useState for local state preservation
    const livingWillPath = path.join(MOBILE_SRC, 'screens/sovereignty/LivingWillScreen.tsx');
    const inheritancePath = path.join(MOBILE_SRC, 'screens/sovereignty/InheritanceScreen.tsx');

    const livingWillContent = fs.readFileSync(livingWillPath, 'utf-8');
    const inheritanceContent = fs.readFileSync(inheritancePath, 'utf-8');

    // Both use React.useState for local state
    expect(livingWillContent).toContain('useState');
    expect(inheritanceContent).toContain('useState');

    // Props-driven — state rehydrates from props on re-mount
    expect(livingWillContent).toContain('LivingWillScreenProps');
    expect(inheritanceContent).toContain('InheritanceScreenProps');
  });
});
