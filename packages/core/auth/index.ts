// Auth — Biometric authentication and sensitive action protection.
// CRITICAL: No networking imports.

export type {
  BiometricType,
  BiometricResult,
  BiometricAdapter,
  LockTimeout,
  AuthConfig,
} from './types.js';

export { DEFAULT_AUTH_CONFIG, LOCK_TIMEOUT_MS } from './types.js';
export { BiometricAuthManager } from './biometric-auth-manager.js';
