// Mobile BiometricAuth — Wraps existing mobile-biometric-adapter for the BiometricAuth interface.
//
// iOS: Face ID / Touch ID with passcode fallback (allowDeviceCredentials: true).
// Android: Fingerprint / face unlock with PIN fallback (allowDeviceCredentials: true).
//
// CRITICAL: No networking imports. Authentication is entirely local.

import { Platform } from 'react-native';
import type { BiometricAuth, BiometricResult } from '@semblance/core/auth/types';
import { createMobileBiometricAdapter } from '../adapters/mobile-biometric-adapter.js';

/**
 * Create a mobile BiometricAuth adapter.
 * Wraps the existing BiometricAdapter with the simplified BiometricAuth interface.
 */
export function createMobileBiometricAuth(): BiometricAuth {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const adapter = createMobileBiometricAdapter(platform);

  return {
    async isAvailable(): Promise<boolean> {
      return adapter.isAvailable();
    },

    async authenticate(reason: string): Promise<BiometricResult> {
      return adapter.authenticate(reason);
    },
  };
}
