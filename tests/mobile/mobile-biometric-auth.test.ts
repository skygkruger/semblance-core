// Mobile BiometricAuth Tests — React Native biometric wrapper.
//
// Covers:
// - Creates BiometricAuth from createMobileBiometricAuth()
// - isAvailable() delegates to underlying adapter
// - authenticate() delegates to underlying adapter
// - Returns BiometricResult interface

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Platform before importing the module under test
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    Platform: { OS: 'ios', select: vi.fn() },
  };
});

// Mock the mobile biometric adapter factory
const mockAdapter = {
  isAvailable: vi.fn().mockResolvedValue(true),
  getBiometricType: vi.fn().mockResolvedValue('face-id'),
  authenticate: vi.fn().mockResolvedValue({ success: true }),
  canStoreInKeychain: vi.fn().mockResolvedValue(true),
};

vi.mock('@semblance/mobile/adapters/mobile-biometric-adapter.js', () => ({
  createMobileBiometricAdapter: vi.fn(() => mockAdapter),
}));

import { createMobileBiometricAuth } from '@semblance/mobile/auth/biometric';

describe('createMobileBiometricAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter.isAvailable.mockResolvedValue(true);
    mockAdapter.authenticate.mockResolvedValue({ success: true });
  });

  it('creates a BiometricAuth with isAvailable and authenticate', () => {
    const auth = createMobileBiometricAuth();
    expect(typeof auth.isAvailable).toBe('function');
    expect(typeof auth.authenticate).toBe('function');
  });

  it('isAvailable delegates to underlying adapter', async () => {
    const auth = createMobileBiometricAuth();
    const available = await auth.isAvailable();
    expect(available).toBe(true);
    expect(mockAdapter.isAvailable).toHaveBeenCalled();
  });

  it('isAvailable returns false when adapter says unavailable', async () => {
    mockAdapter.isAvailable.mockResolvedValue(false);
    const auth = createMobileBiometricAuth();
    const available = await auth.isAvailable();
    expect(available).toBe(false);
  });

  it('authenticate delegates to underlying adapter', async () => {
    const auth = createMobileBiometricAuth();
    const result = await auth.authenticate('Unlock Semblance');
    expect(result.success).toBe(true);
    expect(mockAdapter.authenticate).toHaveBeenCalledWith('Unlock Semblance');
  });

  it('authenticate returns failure from adapter', async () => {
    mockAdapter.authenticate.mockResolvedValue({ success: false, error: 'cancelled' });
    const auth = createMobileBiometricAuth();
    const result = await auth.authenticate('Test');
    expect(result.success).toBe(false);
    expect(result.error).toBe('cancelled');
  });
});
