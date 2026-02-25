// Sensitive Action Guard — Requires biometric re-confirmation for high-risk operations.
// CRITICAL: No networking imports. Entirely local.

import type { BiometricAuthManager } from './biometric-auth-manager.js';

/**
 * Error thrown when a sensitive action is denied due to auth failure.
 */
export class AuthRequiredError extends Error {
  constructor(action: string) {
    super(`Authentication required for action: ${action}`);
    this.name = 'AuthRequiredError';
  }
}

/**
 * Actions that always require biometric re-confirmation.
 */
export const SENSITIVE_ACTIONS = [
  'living-will-export',
  'living-will-import',
  'inheritance-config-change',
  'inheritance-activate',
  'alter-ego-activate',
  'witness-key-export',
  'backup-passphrase-change',
  'auth-settings-change',
  'backup-restore',
  'encryption-key-export',
] as const;

export type SensitiveAction = typeof SENSITIVE_ACTIONS[number];

/**
 * Guards actions behind biometric authentication.
 * Sensitive actions always require re-confirmation.
 * Non-sensitive actions use standard timeout-based auth.
 */
export class SensitiveActionGuard {
  private authManager: BiometricAuthManager;

  constructor(authManager: BiometricAuthManager) {
    this.authManager = authManager;
  }

  /**
   * Check if an action is in the sensitive actions list.
   */
  isSensitiveAction(action: string): boolean {
    return (SENSITIVE_ACTIONS as readonly string[]).includes(action);
  }

  /**
   * Guard an action with appropriate authentication.
   * Throws AuthRequiredError if authentication fails.
   */
  async guard(action: string): Promise<void> {
    const result = this.isSensitiveAction(action)
      ? await this.authManager.requireSensitiveAuth(action)
      : await this.authManager.requireAuth(`Action: ${action}`);

    if (!result.success) {
      throw new AuthRequiredError(action);
    }
  }
}
