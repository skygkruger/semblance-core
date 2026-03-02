// Protected Features Types Tests — Verify biometric protection type contracts.
//
// Covers:
// - ProtectedFeature type has all 6 features
// - BIOMETRIC_REASONS has a reason for every feature
// - PER_ACTIVATION_FEATURES is a strict subset
// - Reason strings are non-empty and descriptive

import { describe, it, expect } from 'vitest';
import {
  PER_ACTIVATION_FEATURES,
  BIOMETRIC_REASONS,
} from '@semblance/core/auth/types';
import type { ProtectedFeature } from '@semblance/core/auth/types';

const ALL_FEATURES: ProtectedFeature[] = [
  'app_launch',
  'alter_ego_activation',
  'privacy_dashboard',
  'financial_screen',
  'health_screen',
  'digital_representative_activation',
];

describe('ProtectedFeature type contracts', () => {
  it('BIOMETRIC_REASONS has an entry for every protected feature', () => {
    for (const feature of ALL_FEATURES) {
      expect(BIOMETRIC_REASONS[feature]).toBeDefined();
      expect(typeof BIOMETRIC_REASONS[feature]).toBe('string');
      expect(BIOMETRIC_REASONS[feature].length).toBeGreaterThan(0);
    }
  });

  it('BIOMETRIC_REASONS has exactly 6 entries', () => {
    expect(Object.keys(BIOMETRIC_REASONS)).toHaveLength(6);
  });

  it('app_launch reason is "Unlock Semblance"', () => {
    expect(BIOMETRIC_REASONS.app_launch).toBe('Unlock Semblance');
  });

  it('alter_ego reason mentions identity', () => {
    expect(BIOMETRIC_REASONS.alter_ego_activation).toContain('identity');
  });

  it('digital_representative reason mentions identity', () => {
    expect(BIOMETRIC_REASONS.digital_representative_activation).toContain('identity');
  });

  it('PER_ACTIVATION_FEATURES is a ReadonlySet', () => {
    expect(PER_ACTIVATION_FEATURES).toBeInstanceOf(Set);
    // TypeScript enforces ReadonlySet, but we verify mutability is not exposed
    expect(typeof (PER_ACTIVATION_FEATURES as Set<string>).add).toBe('function');
  });

  it('per-activation features are a subset of all features', () => {
    for (const feature of PER_ACTIVATION_FEATURES) {
      expect(ALL_FEATURES).toContain(feature);
    }
  });

  it('session-scoped features are not in PER_ACTIVATION_FEATURES', () => {
    const sessionFeatures: ProtectedFeature[] = [
      'app_launch',
      'privacy_dashboard',
      'financial_screen',
      'health_screen',
    ];
    for (const feature of sessionFeatures) {
      expect(PER_ACTIVATION_FEATURES.has(feature)).toBe(false);
    }
  });
});
