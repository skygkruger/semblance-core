// Biometric Auth Types — App-level authentication via platform biometrics.
// CRITICAL: No networking imports. Entirely local.

// ─── Biometric Types ────────────────────────────────────────────────────────

/**
 * Platform biometric authentication mechanism.
 */
export type BiometricType =
  | 'face-id'
  | 'touch-id'
  | 'fingerprint'
  | 'windows-hello'
  | 'pin'
  | 'none';

/**
 * Result of a biometric authentication attempt.
 */
export interface BiometricResult {
  success: boolean;
  error?: 'cancelled' | 'not-enrolled' | 'lockout' | 'not-available' | 'failed';
}

/**
 * Platform adapter for biometric authentication.
 * Desktop: Tauri biometric plugin (Touch ID, Windows Hello).
 * iOS: LocalAuthentication framework (Face ID, Touch ID).
 * Android: BiometricPrompt API (fingerprint, face unlock).
 */
export interface BiometricAdapter {
  /** Check if biometric hardware is available and enrolled */
  isAvailable(): Promise<boolean>;

  /** Get the type of biometric available on this device */
  getBiometricType(): Promise<BiometricType>;

  /** Prompt user for biometric authentication with a reason string */
  authenticate(reason: string): Promise<BiometricResult>;

  /** Check if the platform can store secrets in biometric-protected keychain */
  canStoreInKeychain(): Promise<boolean>;
}

// ─── Auth Configuration ─────────────────────────────────────────────────────

/**
 * Lock timeout duration labels.
 */
export type LockTimeout = 'immediate' | '1min' | '5min' | '15min' | 'never';

/**
 * App-level authentication configuration.
 */
export interface AuthConfig {
  /** Whether biometric auth is enabled for app access */
  enabled: boolean;
  /** How long before the app re-locks after authentication */
  lockTimeout: LockTimeout;
  /** Whether sensitive actions require re-confirmation even within timeout */
  sensitiveActionReconfirm: boolean;
  /** Timestamp of last successful authentication (ms since epoch) */
  lastAuthTimestamp: number;
}

/**
 * Default auth configuration — enabled with 5-minute timeout.
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  enabled: true,
  lockTimeout: '5min',
  sensitiveActionReconfirm: true,
  lastAuthTimestamp: 0,
};

/**
 * Map of lock timeout names to milliseconds.
 */
export const LOCK_TIMEOUT_MS: Record<LockTimeout, number> = {
  immediate: 0,
  '1min': 60_000,
  '5min': 300_000,
  '15min': 900_000,
  never: Number.MAX_SAFE_INTEGER,
};
