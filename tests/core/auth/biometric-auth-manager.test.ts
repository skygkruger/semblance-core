// Biometric Auth Manager Tests — App-level biometric authentication.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BiometricAuthManager } from '@semblance/core/auth/biometric-auth-manager.js';
import type { BiometricAdapter, BiometricResult } from '@semblance/core/auth/types.js';

function createMockAdapter(overrides: Partial<BiometricAdapter> = {}): BiometricAdapter {
  return {
    isAvailable: vi.fn().mockResolvedValue(true),
    getBiometricType: vi.fn().mockResolvedValue('face-id'),
    authenticate: vi.fn().mockResolvedValue({ success: true }),
    canStoreInKeychain: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('BiometricAuthManager', () => {
  let manager: BiometricAuthManager;
  let adapter: BiometricAdapter;

  beforeEach(() => {
    manager = new BiometricAuthManager();
    adapter = createMockAdapter();
    vi.useFakeTimers();
  });

  it('initializes with available biometric adapter', () => {
    manager.initialize(adapter);
    // After initialization, manager should be functional
    expect(manager.isEnabled()).toBe(true); // DEFAULT_AUTH_CONFIG.enabled = true
  });

  it('setEnabled(true) enables when hardware available', async () => {
    manager.initialize(adapter);
    manager.setAuthConfig({ enabled: false });
    expect(manager.isEnabled()).toBe(false);

    const result = await manager.setEnabled(true);
    expect(result).toBe(true);
    expect(manager.isEnabled()).toBe(true);
    expect(adapter.isAvailable).toHaveBeenCalled();
  });

  it('setEnabled(true) returns false when hardware unavailable', async () => {
    const unavailableAdapter = createMockAdapter({
      isAvailable: vi.fn().mockResolvedValue(false),
    });
    manager.initialize(unavailableAdapter);
    manager.setAuthConfig({ enabled: false });

    const result = await manager.setEnabled(true);
    expect(result).toBe(false);
    expect(manager.isEnabled()).toBe(false);
  });

  it('requireAuth returns success when auth disabled', async () => {
    manager.initialize(adapter);
    manager.setAuthConfig({ enabled: false });

    const result = await manager.requireAuth('Test access');
    expect(result.success).toBe(true);
    expect(adapter.authenticate).not.toHaveBeenCalled();
  });

  it('requireAuth returns success when within timeout window', async () => {
    manager.initialize(adapter);
    // Set lastAuthTimestamp to now — within 5min timeout
    vi.setSystemTime(new Date('2026-02-24T10:00:00Z'));
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      lastAuthTimestamp: Date.now(),
    });

    const result = await manager.requireAuth('Test access');
    expect(result.success).toBe(true);
    expect(adapter.authenticate).not.toHaveBeenCalled();
  });

  it('requireAuth calls adapter.authenticate() when locked (timeout exceeded)', async () => {
    manager.initialize(adapter);
    vi.setSystemTime(new Date('2026-02-24T10:00:00Z'));
    // Set lastAuthTimestamp to 10 minutes ago — past the 5min timeout
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      lastAuthTimestamp: Date.now() - 600_000,
    });

    const result = await manager.requireAuth('Unlock Semblance');
    expect(result.success).toBe(true);
    expect(adapter.authenticate).toHaveBeenCalledWith('Unlock Semblance');
  });

  it('requireSensitiveAuth always prompts when sensitiveActionReconfirm=true', async () => {
    manager.initialize(adapter);
    vi.setSystemTime(new Date('2026-02-24T10:00:00Z'));
    // Even within timeout, sensitive actions should prompt
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      sensitiveActionReconfirm: true,
      lastAuthTimestamp: Date.now(),
    });

    const result = await manager.requireSensitiveAuth('living-will-export');
    expect(result.success).toBe(true);
    expect(adapter.authenticate).toHaveBeenCalledWith(
      'Authenticate to perform: living-will-export',
    );
  });

  it('isLocked returns true when lastAuthTimestamp is stale', () => {
    manager.initialize(adapter);
    vi.setSystemTime(new Date('2026-02-24T10:10:00Z'));
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      lastAuthTimestamp: new Date('2026-02-24T10:00:00Z').getTime(),
    });

    expect(manager.isLocked()).toBe(true);
  });

  it('isLocked returns false within timeout window', () => {
    manager.initialize(adapter);
    vi.setSystemTime(new Date('2026-02-24T10:02:00Z'));
    manager.setAuthConfig({
      enabled: true,
      lockTimeout: '5min',
      lastAuthTimestamp: new Date('2026-02-24T10:00:00Z').getTime(),
    });

    expect(manager.isLocked()).toBe(false);
  });

  it('setAuthConfig updates partial config preserving other fields', () => {
    manager.initialize(adapter);
    manager.setAuthConfig({ lockTimeout: '15min' });

    const config = manager.getAuthConfig();
    expect(config.lockTimeout).toBe('15min');
    expect(config.enabled).toBe(true); // preserved from default
    expect(config.sensitiveActionReconfirm).toBe(true); // preserved from default
  });
});
