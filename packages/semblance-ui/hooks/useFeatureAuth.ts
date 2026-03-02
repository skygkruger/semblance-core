// useFeatureAuth — Hook for feature-level biometric protection.
//
// Platform adapters inject BiometricAuth + SessionAuthState via React context.
// This hook checks session state first, then prompts biometric if needed.
//
// Usage:
//   const { requireAuth } = useFeatureAuth();
//   const proceed = await requireAuth('privacy_dashboard');
//   if (!proceed) return; // user cancelled or failed

import { createContext, useContext, useCallback } from 'react';
import type { ProtectedFeature, BiometricAuth, BiometricResult } from '@semblance/core/auth/types';
import { PER_ACTIVATION_FEATURES, BIOMETRIC_REASONS } from '@semblance/core/auth/types';

/**
 * Session auth state abstraction — platform provides the implementation.
 */
export interface SessionAuthStateProvider {
  isAuthenticated(feature: ProtectedFeature): boolean;
  markAuthenticated(feature: ProtectedFeature): void;
}

export interface FeatureAuthContextValue {
  biometricAuth: BiometricAuth | null;
  sessionAuth: SessionAuthStateProvider | null;
}

export const FeatureAuthContext = createContext<FeatureAuthContextValue>({
  biometricAuth: null,
  sessionAuth: null,
});

/**
 * Hook to require biometric authentication for a protected feature.
 *
 * Returns `requireAuth(feature)` which:
 * 1. If session already authenticated for this feature → returns true immediately
 * 2. If per-activation feature → always prompts biometric
 * 3. On success → marks session authenticated → returns true
 * 4. On failure/cancel → returns false
 * 5. If biometric not available → returns true (auto-pass, no lockout)
 */
export function useFeatureAuth() {
  const { biometricAuth, sessionAuth } = useContext(FeatureAuthContext);

  const requireAuth = useCallback(async (feature: ProtectedFeature): Promise<BiometricResult> => {
    // If no auth system configured, auto-pass
    if (!biometricAuth || !sessionAuth) {
      return { success: true };
    }

    // Check session state first (per-activation features always return false)
    if (sessionAuth.isAuthenticated(feature)) {
      return { success: true };
    }

    // Check if biometric is available
    const available = await biometricAuth.isAvailable();
    if (!available) {
      // No biometric → auto-pass (don't lock users out)
      if (!PER_ACTIVATION_FEATURES.has(feature)) {
        sessionAuth.markAuthenticated(feature);
      }
      return { success: true };
    }

    // Prompt biometric
    const reason = BIOMETRIC_REASONS[feature];
    const result = await biometricAuth.authenticate(reason);

    if (result.success && !PER_ACTIVATION_FEATURES.has(feature)) {
      sessionAuth.markAuthenticated(feature);
    }

    return result;
  }, [biometricAuth, sessionAuth]);

  return { requireAuth };
}
