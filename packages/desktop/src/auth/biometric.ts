// Desktop BiometricAuth — Tauri biometric plugin adapter.
//
// Uses Touch ID (macOS), Windows Hello (Windows), or PIN/passcode fallback.
// Linux: auto-passes if no biometric hardware detected (no universal biometric API).
//
// CRITICAL: No networking imports. Authentication is entirely local.

import { invoke } from '@tauri-apps/api/core';
import type { BiometricAuth, BiometricResult } from '@semblance/core/auth/types';

/**
 * Tauri biometric plugin response shape.
 */
interface TauriBiometricStatus {
  available: boolean;
}

/**
 * Create a desktop BiometricAuth adapter using Tauri biometric plugin.
 */
export function createDesktopBiometricAuth(): BiometricAuth {
  // Cache platform detection
  let platformCache: string | null = null;

  async function getPlatformName(): Promise<string> {
    if (platformCache) return platformCache;
    try {
      platformCache = await invoke<string>('plugin:os|platform');
    } catch {
      platformCache = 'unknown';
    }
    return platformCache;
  }

  return {
    async isAvailable(): Promise<boolean> {
      try {
        const platform = await getPlatformName();

        // Linux lacks universal biometric API — auto-pass (no user lockout)
        if (platform === 'linux') {
          return false;
        }

        const status = await invoke<TauriBiometricStatus>(
          'plugin:biometric|status',
        );
        return status.available;
      } catch {
        return false;
      }
    },

    async authenticate(reason: string): Promise<BiometricResult> {
      try {
        const platform = await getPlatformName();

        // Linux: no biometric hardware → auto-pass
        if (platform === 'linux') {
          return { success: true };
        }

        await invoke('plugin:biometric|authenticate', {
          reason,
          // Allow device passcode fallback on macOS/Windows
          allowDeviceCredential: true,
        });

        // If invoke doesn't throw, authentication succeeded
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();

        if (lower.includes('cancel')) {
          return { success: false, error: 'cancelled' };
        }
        if (lower.includes('not enrolled') || lower.includes('no biometric')) {
          return { success: false, error: 'not-enrolled' };
        }
        if (lower.includes('lockout') || lower.includes('locked out')) {
          return { success: false, error: 'lockout' };
        }
        if (lower.includes('not available') || lower.includes('unavailable')) {
          return { success: false, error: 'not-available' };
        }

        return { success: false, error: 'failed' };
      }
    },
  };
}
