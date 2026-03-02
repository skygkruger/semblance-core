// Desktop BiometricAuth Tests — Tauri biometric plugin adapter.
//
// Covers:
// - isAvailable() calls Tauri plugin
// - Linux auto-passes (returns false for isAvailable)
// - authenticate() returns success on successful invoke
// - authenticate() maps error types correctly (cancel, lockout, etc.)
// - Linux authenticate() auto-passes
// - Platform detection is cached

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { invoke, clearInvokeMocks, mockInvokeCommand } from '../helpers/mock-tauri';
import { createDesktopBiometricAuth } from '@semblance/desktop/auth/biometric';
import type { BiometricAuth } from '@semblance/core/auth/types';

describe('createDesktopBiometricAuth', () => {
  let auth: BiometricAuth;

  beforeEach(() => {
    clearInvokeMocks();
    // Default: macOS with biometric available
    mockInvokeCommand('plugin:os|platform', () => 'macos');
    mockInvokeCommand('plugin:biometric|status', () => ({ available: true }));
    mockInvokeCommand('plugin:biometric|authenticate', () => undefined);

    auth = createDesktopBiometricAuth();
  });

  // ─── isAvailable ──────────────────────────────────────────────────────

  it('returns true when biometric hardware is available', async () => {
    const available = await auth.isAvailable();
    expect(available).toBe(true);
  });

  it('returns false when biometric hardware is unavailable', async () => {
    mockInvokeCommand('plugin:biometric|status', () => ({ available: false }));
    auth = createDesktopBiometricAuth();

    const available = await auth.isAvailable();
    expect(available).toBe(false);
  });

  it('returns false on Linux (auto-pass — no biometric API)', async () => {
    mockInvokeCommand('plugin:os|platform', () => 'linux');
    auth = createDesktopBiometricAuth();

    const available = await auth.isAvailable();
    expect(available).toBe(false);
  });

  it('returns false when plugin:biometric|status throws', async () => {
    mockInvokeCommand('plugin:biometric|status', () => {
      throw new Error('Plugin not available');
    });
    auth = createDesktopBiometricAuth();

    const available = await auth.isAvailable();
    expect(available).toBe(false);
  });

  // ─── authenticate ────────────────────────────────────────────────────

  it('returns success when biometric authentication succeeds', async () => {
    const result = await auth.authenticate('Unlock Semblance');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('passes reason string and allowDeviceCredential to plugin', async () => {
    await auth.authenticate('Test reason');
    expect(invoke).toHaveBeenCalledWith('plugin:biometric|authenticate', {
      reason: 'Test reason',
      allowDeviceCredential: true,
    });
  });

  it('returns cancelled error when user cancels', async () => {
    mockInvokeCommand('plugin:biometric|authenticate', () => {
      throw new Error('User cancelled authentication');
    });
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('cancelled');
  });

  it('returns not-enrolled error when no biometric enrolled', async () => {
    mockInvokeCommand('plugin:biometric|authenticate', () => {
      throw new Error('No biometric enrolled');
    });
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('not-enrolled');
  });

  it('returns lockout error on too many failed attempts', async () => {
    mockInvokeCommand('plugin:biometric|authenticate', () => {
      throw new Error('Biometric lockout');
    });
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('lockout');
  });

  it('returns not-available error when hardware unavailable', async () => {
    mockInvokeCommand('plugin:biometric|authenticate', () => {
      throw new Error('Biometric not available');
    });
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('not-available');
  });

  it('returns generic failed error for unknown errors', async () => {
    mockInvokeCommand('plugin:biometric|authenticate', () => {
      throw new Error('Something unexpected');
    });
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('failed');
  });

  // ─── Linux auto-pass ──────────────────────────────────────────────────

  it('authenticate auto-passes on Linux without calling biometric plugin', async () => {
    mockInvokeCommand('plugin:os|platform', () => 'linux');
    auth = createDesktopBiometricAuth();

    const result = await auth.authenticate('Unlock Semblance');
    expect(result.success).toBe(true);
    // Should not have called authenticate plugin
    const authenticateCalls = (invoke as ReturnType<typeof vi.fn>).mock.calls
      .filter((args) => args[0] === 'plugin:biometric|authenticate');
    expect(authenticateCalls).toHaveLength(0);
  });

  // ─── Windows ──────────────────────────────────────────────────────────

  it('isAvailable works on Windows when Windows Hello is available', async () => {
    mockInvokeCommand('plugin:os|platform', () => 'windows');
    mockInvokeCommand('plugin:biometric|status', () => ({ available: true }));
    auth = createDesktopBiometricAuth();

    const available = await auth.isAvailable();
    expect(available).toBe(true);
  });
});
