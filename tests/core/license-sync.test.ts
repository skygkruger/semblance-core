// Tests for license key sync — build, apply, and conflict resolution.

import { describe, it, expect, vi } from 'vitest';
import {
  buildLicenseSyncItem,
  applyLicenseSyncItem,
  type LicenseStateReader,
  type LicenseActivator,
  type LicenseSyncData,
} from '@semblance/core/routing/license-sync';
import { resolveConflict, type SyncItem } from '@semblance/core/routing/sync';

// ─── Mock Helpers ──────────────────────────────────────────────────────────────

function makeMockGate(overrides: Partial<LicenseStateReader> = {}): LicenseStateReader {
  return {
    isPremium: () => true,
    getTier: () => 'digital-representative' as const,
    getLicenseKey: () => 'sem_header.payload.signature',
    getActivatedAt: () => '2026-02-15T10:00:00Z',
    getExpiresAt: () => null,
    getFoundingSeat: () => null,
    ...overrides,
  };
}

function makeMockActivator(success = true): LicenseActivator {
  return {
    activateLicense: vi.fn().mockResolvedValue({ success, error: success ? undefined : 'Invalid key' }),
  };
}

function makeLicenseSyncItem(overrides: Partial<LicenseSyncData> = {}): SyncItem {
  return {
    id: 'license-active',
    type: 'license',
    data: {
      licenseKey: 'sem_header.payload.signature',
      tier: 'digital-representative',
      activatedAt: '2026-02-15T10:00:00Z',
      expiresAt: null,
      foundingSeat: null,
      ...overrides,
    },
    updatedAt: '2026-02-15T10:00:00Z',
    sourceDeviceId: 'device-1',
  };
}

// Mock the license key verification module
vi.mock('@semblance/core/premium/license-keys', () => ({
  verifyLicenseKeySignature: (key: string) => {
    // Accept keys starting with 'sem_' as valid
    if (key.startsWith('sem_')) {
      return { valid: true, payload: { tier: 'digital-representative' } };
    }
    return { valid: false, error: 'Invalid signature' };
  },
}));

// ─── buildLicenseSyncItem ──────────────────────────────────────────────────────

describe('buildLicenseSyncItem', () => {
  it('returns null for free tier', () => {
    const gate = makeMockGate({ isPremium: () => false });
    const item = buildLicenseSyncItem(gate, 'device-1');
    expect(item).toBeNull();
  });

  it('returns valid SyncItem for premium tier', () => {
    const gate = makeMockGate();
    const item = buildLicenseSyncItem(gate, 'device-1');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('license');
    expect(item!.id).toBe('license-active');
    expect(item!.sourceDeviceId).toBe('device-1');
    const data = item!.data as LicenseSyncData;
    expect(data.licenseKey).toBe('sem_header.payload.signature');
    expect(data.tier).toBe('digital-representative');
  });

  it('returns null when no license key is present', () => {
    const gate = makeMockGate({ getLicenseKey: () => null });
    const item = buildLicenseSyncItem(gate, 'device-1');
    expect(item).toBeNull();
  });

  it('uses singleton ID license-active', () => {
    const gate = makeMockGate();
    const item = buildLicenseSyncItem(gate, 'device-A');
    const item2 = buildLicenseSyncItem(gate, 'device-B');
    expect(item!.id).toBe('license-active');
    expect(item2!.id).toBe('license-active');
  });

  it('includes founding seat when present', () => {
    const gate = makeMockGate({ getFoundingSeat: () => 42 });
    const item = buildLicenseSyncItem(gate, 'device-1');
    const data = item!.data as LicenseSyncData;
    expect(data.foundingSeat).toBe(42);
  });
});

// ─── applyLicenseSyncItem ──────────────────────────────────────────────────────

describe('applyLicenseSyncItem', () => {
  it('accepts valid signature and activates', async () => {
    const activator = makeMockActivator(true);
    const item = makeLicenseSyncItem();
    const result = await applyLicenseSyncItem(item, activator);
    expect(result).toBe(true);
    expect(activator.activateLicense).toHaveBeenCalledWith('sem_header.payload.signature');
  });

  it('rejects invalid signature', async () => {
    const activator = makeMockActivator(true);
    const item = makeLicenseSyncItem({ licenseKey: 'invalid_key' });
    const result = await applyLicenseSyncItem(item, activator);
    expect(result).toBe(false);
    expect(activator.activateLicense).not.toHaveBeenCalled();
  });

  it('rejects expired key', async () => {
    const activator = makeMockActivator(true);
    const item = makeLicenseSyncItem({ expiresAt: '2020-01-01T00:00:00Z' });
    const result = await applyLicenseSyncItem(item, activator);
    expect(result).toBe(false);
    expect(activator.activateLicense).not.toHaveBeenCalled();
  });

  it('rejects non-license sync items', async () => {
    const activator = makeMockActivator(true);
    const item: SyncItem = {
      id: 'some-pref',
      type: 'preference',
      data: {},
      updatedAt: '2026-01-01T00:00:00Z',
      sourceDeviceId: 'device-1',
    };
    const result = await applyLicenseSyncItem(item, activator);
    expect(result).toBe(false);
  });

  it('rejects item with wrong ID', async () => {
    const activator = makeMockActivator(true);
    const item: SyncItem = {
      id: 'wrong-id',
      type: 'license',
      data: { licenseKey: 'sem_header.payload.signature' },
      updatedAt: '2026-01-01T00:00:00Z',
      sourceDeviceId: 'device-1',
    };
    const result = await applyLicenseSyncItem(item, activator);
    expect(result).toBe(false);
  });
});

// ─── Conflict Resolution ───────────────────────────────────────────────────────

describe('license conflict resolution', () => {
  it('remote newer wins', () => {
    const local: SyncItem = {
      id: 'license-active',
      type: 'license',
      data: {},
      updatedAt: '2026-01-01T00:00:00Z',
      sourceDeviceId: 'device-1',
    };
    const remote: SyncItem = {
      id: 'license-active',
      type: 'license',
      data: {},
      updatedAt: '2026-02-01T00:00:00Z',
      sourceDeviceId: 'device-2',
    };
    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('remote_wins');
    expect(result.winner).toBe('remote');
  });

  it('local newer wins', () => {
    const local: SyncItem = {
      id: 'license-active',
      type: 'license',
      data: {},
      updatedAt: '2026-03-01T00:00:00Z',
      sourceDeviceId: 'device-1',
    };
    const remote: SyncItem = {
      id: 'license-active',
      type: 'license',
      data: {},
      updatedAt: '2026-01-01T00:00:00Z',
      sourceDeviceId: 'device-2',
    };
    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('local_wins');
    expect(result.winner).toBe('local');
  });
});

// ─── Round-trip ────────────────────────────────────────────────────────────────

describe('license sync round-trip', () => {
  it('build then apply activates on receiving device', async () => {
    const gate = makeMockGate();
    const item = buildLicenseSyncItem(gate, 'device-1');
    expect(item).not.toBeNull();

    const activator = makeMockActivator(true);
    const result = await applyLicenseSyncItem(item!, activator);
    expect(result).toBe(true);
    expect(activator.activateLicense).toHaveBeenCalledWith('sem_header.payload.signature');
  });

  it('no license on either device: build returns null', () => {
    const gate = makeMockGate({ isPremium: () => false });
    const item = buildLicenseSyncItem(gate, 'device-1');
    expect(item).toBeNull();
  });
});
