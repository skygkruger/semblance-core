// Biometric Auth Manager — Controls app-level biometric authentication.
// Manages lock state, timeout, and re-confirmation for sensitive actions.
// CRITICAL: No networking imports. Entirely local.

import type { BiometricAdapter, BiometricResult, AuthConfig } from './types.js';
import { DEFAULT_AUTH_CONFIG, LOCK_TIMEOUT_MS } from './types.js';

/**
 * Manages biometric authentication state and lock behavior.
 */
export class BiometricAuthManager {
  private adapter: BiometricAdapter | null = null;
  private config: AuthConfig = { ...DEFAULT_AUTH_CONFIG };

  /**
   * Initialize with a platform-specific biometric adapter.
   */
  initialize(adapter: BiometricAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Whether biometric auth is currently enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable biometric authentication.
   * Disabling requires a successful biometric confirmation first.
   */
  async setEnabled(enabled: boolean): Promise<boolean> {
    if (!this.adapter) return false;

    if (enabled) {
      // Can only enable if hardware is available
      const available = await this.adapter.isAvailable();
      if (!available) return false;
      this.config.enabled = true;
      return true;
    }

    // Disabling requires biometric confirmation
    const result = await this.adapter.authenticate('Confirm identity to disable biometric lock');
    if (!result.success) return false;
    this.config.enabled = false;
    return true;
  }

  /**
   * Require authentication. Returns success immediately if:
   * - Auth is disabled, OR
   * - Within the lock timeout window.
   * Otherwise prompts biometric.
   */
  async requireAuth(reason: string): Promise<BiometricResult> {
    if (!this.config.enabled) {
      return { success: true };
    }

    if (!this.isLocked()) {
      this.updateLastAuth();
      return { success: true };
    }

    if (!this.adapter) {
      return { success: false, error: 'not-available' };
    }

    const result = await this.adapter.authenticate(reason);
    if (result.success) {
      this.updateLastAuth();
    }
    return result;
  }

  /**
   * Require authentication for a sensitive action.
   * Always prompts biometric if sensitiveActionReconfirm is true,
   * regardless of lock timeout.
   */
  async requireSensitiveAuth(action: string): Promise<BiometricResult> {
    if (!this.config.enabled) {
      return { success: true };
    }

    if (!this.adapter) {
      return { success: false, error: 'not-available' };
    }

    if (this.config.sensitiveActionReconfirm) {
      const result = await this.adapter.authenticate(
        `Authenticate to perform: ${action}`,
      );
      if (result.success) {
        this.updateLastAuth();
      }
      return result;
    }

    return this.requireAuth(`Authenticate to perform: ${action}`);
  }

  /**
   * Whether the app is currently locked (timeout exceeded).
   */
  isLocked(): boolean {
    const timeoutMs = LOCK_TIMEOUT_MS[this.config.lockTimeout];
    return Date.now() - this.config.lastAuthTimestamp > timeoutMs;
  }

  /**
   * Update the last authentication timestamp to now.
   */
  updateLastAuth(): void {
    this.config.lastAuthTimestamp = Date.now();
  }

  /**
   * Get the current auth configuration.
   */
  getAuthConfig(): AuthConfig {
    return { ...this.config };
  }

  /**
   * Update auth configuration partially, preserving unspecified fields.
   */
  setAuthConfig(partial: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}
