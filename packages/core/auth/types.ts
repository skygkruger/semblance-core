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

// ─── Protected Features ─────────────────────────────────────────────────────

/**
 * Features that require biometric authentication before access.
 *
 * Session-scoped features unlock once per session (app_launch, privacy_dashboard,
 * financial_screen, health_screen).
 *
 * Per-activation features always prompt regardless of session state
 * (alter_ego_activation, digital_representative_activation).
 */
export type ProtectedFeature =
  | 'app_launch'
  | 'alter_ego_activation'
  | 'privacy_dashboard'
  | 'financial_screen'
  | 'health_screen'
  | 'digital_representative_activation';

/**
 * Features that always require authentication, even within an active session.
 */
export const PER_ACTIVATION_FEATURES: ReadonlySet<ProtectedFeature> = new Set([
  'alter_ego_activation',
  'digital_representative_activation',
]);

/**
 * Reason strings shown to the user for each protected feature.
 */
export const BIOMETRIC_REASONS: Record<ProtectedFeature, string> = {
  app_launch: 'Unlock Semblance',
  alter_ego_activation: 'Confirm identity to enable Alter Ego',
  privacy_dashboard: 'Authenticate to view Privacy Dashboard',
  financial_screen: 'Authenticate to view financial data',
  health_screen: 'Authenticate to view health data',
  digital_representative_activation: 'Confirm identity to activate Digital Representative',
};

/**
 * Simplified biometric authentication interface for the protection layer.
 * Platform adapters (desktop Tauri, mobile RN) implement this.
 */
export interface BiometricAuth {
  /** Check if biometric (or device passcode fallback) is available */
  isAvailable(): Promise<boolean>;

  /** Prompt user for biometric authentication with a reason string */
  authenticate(reason: string): Promise<BiometricResult>;
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
