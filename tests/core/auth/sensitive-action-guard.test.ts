// Sensitive Action Guard Tests — Biometric re-confirmation for high-risk operations.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BiometricAuthManager } from '@semblance/core/auth/biometric-auth-manager.js';
import {
  SensitiveActionGuard,
  AuthRequiredError,
  SENSITIVE_ACTIONS,
} from '@semblance/core/auth/sensitive-action-guard.js';
import type { BiometricAdapter } from '@semblance/core/auth/types.js';

function createMockAdapter(overrides: Partial<BiometricAdapter> = {}): BiometricAdapter {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    getBiometricType: vi.fn().mockResolvedValue('face-id'),
    authenticate: vi.fn().mockResolvedValue({ success: true }),
    canStoreInKeychain: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('SensitiveActionGuard', () => {
  let manager: BiometricAuthManager;
  let guard: SensitiveActionGuard;
  let adapter: BiometricAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24T10:00:00Z'));

    manager = new BiometricAuthManager();
    adapter = createMockAdapter();
    manager.initialize(adapter);
    // Force locked state so auth is required
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      sensitiveActionReconfirm: true,
      lastAuthTimestamp: Date.now() - 600_000, // 10 min ago
    });
    guard = new SensitiveActionGuard(manager);
  });

  it('isSensitiveAction returns true for listed actions', () => {
    expect(guard.isSensitiveAction('living-will-export')).toBe(true);
    expect(guard.isSensitiveAction('backup-restore')).toBe(true);
    expect(guard.isSensitiveAction('encryption-key-export')).toBe(true);
  });

  it('isSensitiveAction returns false for non-sensitive actions', () => {
    expect(guard.isSensitiveAction('email.send')).toBe(false);
    expect(guard.isSensitiveAction('calendar.create')).toBe(false);
    expect(guard.isSensitiveAction('read-settings')).toBe(false);
  });

  it('guard() calls requireSensitiveAuth for sensitive actions', async () => {
    const requireSensitiveSpy = vi.spyOn(manager, 'requireSensitiveAuth');
    await guard.guard('living-will-export');
    expect(requireSensitiveSpy).toHaveBeenCalledWith('living-will-export');
  });

  it('guard() calls requireAuth for non-sensitive actions', async () => {
    const requireAuthSpy = vi.spyOn(manager, 'requireAuth');
    await guard.guard('email.send');
    expect(requireAuthSpy).toHaveBeenCalledWith('Action: email.send');
  });

  it('guard() throws AuthRequiredError when auth fails', async () => {
    const failAdapter = createMockAdapter({
      authenticate: vi.fn().mockResolvedValue({ success: false, error: 'cancelled' }),
    });
    manager.initialize(failAdapter);

    await expect(guard.guard('living-will-export')).rejects.toThrow(AuthRequiredError);
    await expect(guard.guard('living-will-export')).rejects.toThrow(
      'Authentication required for action: living-will-export',
    );
  });

  it('all SENSITIVE_ACTIONS are registered and recognized', () => {
    const expected = [
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
    ];

    expect(SENSITIVE_ACTIONS).toHaveLength(expected.length);
    for (const action of expected) {
      expect(guard.isSensitiveAction(action)).toBe(true);
    }
  });
});
