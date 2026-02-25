// Mobile Biometric Adapter — React Native adapter wrapping platform biometrics.
//
// iOS: LocalAuthentication framework (Face ID, Touch ID).
// Android: BiometricPrompt API (fingerprint, face unlock).
// Fallback: Device passcode when biometrics unavailable or not enrolled.
//
// CRITICAL: No network imports. Authentication is entirely local.

import type { BiometricAdapter, BiometricType, BiometricResult } from '@semblance/core/auth/types';

/**
 * Shape of the react-native-biometrics module.
 * Defined here to avoid importing the library at type level.
 */
interface RNBiometricsModule {
  isSensorAvailable(): Promise<{
    available: boolean;
    biometryType: 'FaceID' | 'TouchID' | 'Biometrics' | null;
    error?: string;
  }>;
  simplePrompt(options: { promptMessage: string; cancelButtonText?: string }): Promise<{
    success: boolean;
    error?: string;
  }>;
}

/**
 * Map RN biometry type string to our BiometricType.
 */
function mapBiometryType(rnType: string | null, platform: 'ios' | 'android'): BiometricType {
  if (!rnType) return 'none';
  if (rnType === 'FaceID') return 'face-id';
  if (rnType === 'TouchID') return 'touch-id';
  if (rnType === 'Biometrics') {
    return platform === 'ios' ? 'touch-id' : 'fingerprint';
  }
  return 'none';
}

/**
 * Map RN error strings to our BiometricResult error codes.
 */
function mapError(error?: string): BiometricResult['error'] {
  if (!error) return 'failed';
  const lower = error.toLowerCase();
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('not enrolled') || lower.includes('no biometrics')) return 'not-enrolled';
  if (lower.includes('lockout') || lower.includes('locked out')) return 'lockout';
  if (lower.includes('not available') || lower.includes('unavailable')) return 'not-available';
  return 'failed';
}

/**
 * Create the React Native biometric adapter.
 * Wraps react-native-biometrics with proper fallback handling.
 */
export function createMobileBiometricAdapter(platform: 'ios' | 'android'): BiometricAdapter {
  // Lazy import to avoid loading native module at type-checking time
  let biometrics: RNBiometricsModule | null = null;

  function getBiometrics(): RNBiometricsModule | null {
    if (!biometrics) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        biometrics = new (require('react-native-biometrics').default)({
          allowDeviceCredentials: true,
        });
      } catch {
        return null;
      }
    }
    return biometrics;
  }

  return {
    async isAvailable(): Promise<boolean> {
      const bio = getBiometrics();
      if (!bio) return false;
      try {
        const result = await bio.isSensorAvailable();
        return result.available;
      } catch {
        return false;
      }
    },

    async getBiometricType(): Promise<BiometricType> {
      const bio = getBiometrics();
      if (!bio) return 'none';
      try {
        const result = await bio.isSensorAvailable();
        if (!result.available) return 'none';
        return mapBiometryType(result.biometryType, platform);
      } catch {
        return 'none';
      }
    },

    async authenticate(reason: string): Promise<BiometricResult> {
      const bio = getBiometrics();
      if (!bio) {
        return { success: false, error: 'not-available' };
      }

      try {
        const available = await bio.isSensorAvailable();
        if (!available.available) {
          return { success: false, error: mapError(available.error) };
        }

        const result = await bio.simplePrompt({
          promptMessage: reason,
          cancelButtonText: 'Cancel',
        });

        if (result.success) {
          return { success: true };
        }

        return { success: false, error: mapError(result.error) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        return { success: false, error: mapError(msg) };
      }
    },

    async canStoreInKeychain(): Promise<boolean> {
      const bio = getBiometrics();
      if (!bio) return false;
      try {
        const result = await bio.isSensorAvailable();
        return result.available;
      } catch {
        return false;
      }
    },
  };
}
