// Tests for SyncEngine.triggerSync() — on-demand sync with all reachable paired devices.
// Used by the "Sync Now" button in Settings.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SyncEngine,
  SYNC_PROTOCOL_VERSION,
} from '@semblance/core/routing/sync.js';
import type {
  SyncCryptoProvider,
  SyncTransport,
  EncryptedSyncPayload,
  SyncItem,
  SyncItemType,
  SyncManifest,
} from '@semblance/core/routing/sync.js';

// ─── Mock Crypto Provider ───────────────────────────────────────────────────

function createMockCrypto(): SyncCryptoProvider {
  return {
    encrypt: vi.fn(async (plaintext: string, _secret: string) => ({
      ciphertext: Buffer.from(plaintext).toString('base64'),
      iv: 'mock-iv-12345678',
    })),
    decrypt: vi.fn(async (ciphertext: string, _iv: string, _secret: string) =>
      Buffer.from(ciphertext, 'base64').toString('utf-8'),
    ),
    hmac: vi.fn(async (data: string, _key: string) =>
      `hmac-${data.slice(0, 8)}`,
    ),
  };
}

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport(): SyncTransport & {
  _reachable: Set<string>;
  setResponse: (response: EncryptedSyncPayload | null) => void;
  setResponseForDevice: (deviceId: string, response: EncryptedSyncPayload | null) => void;
} {
  let defaultResponse: EncryptedSyncPayload | null = null;
  const perDeviceResponses = new Map<string, EncryptedSyncPayload | null>();
  const reachable = new Set<string>();

  return {
    _reachable: reachable,
    send: vi.fn(async (deviceId: string, _payload: EncryptedSyncPayload) => {
      if (perDeviceResponses.has(deviceId)) {
        return perDeviceResponses.get(deviceId)!;
      }
      return defaultResponse;
    }),
    onReceive: vi.fn(),
    isDeviceReachable: vi.fn((deviceId: string) => reachable.has(deviceId)),
    setResponse: (r: EncryptedSyncPayload | null) => { defaultResponse = r; },
    setResponseForDevice: (deviceId: string, r: EncryptedSyncPayload | null) => {
      perDeviceResponses.set(deviceId, r);
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSyncItem(overrides: Partial<SyncItem> & { id: string; type: SyncItemType }): SyncItem {
  return {
    data: { value: 'test' },
    updatedAt: new Date().toISOString(),
    sourceDeviceId: 'device-1',
    ...overrides,
  };
}

/**
 * Build an encrypted response manifest from a temporary SyncEngine.
 * Simulates a remote device replying with its items.
 */
async function buildEncryptedResponse(
  remoteDeviceId: string,
  remoteDeviceName: string,
  targetDeviceId: string,
  items: SyncItem[],
): Promise<EncryptedSyncPayload> {
  const remoteCrypto = createMockCrypto();
  const remoteEngine = new SyncEngine({
    deviceId: remoteDeviceId,
    deviceType: 'mobile',
    crypto: remoteCrypto,
  });
  remoteEngine.registerPairedDevice(targetDeviceId, 'shared-secret');
  for (const item of items) {
    remoteEngine.upsertItem(item);
  }
  const manifest = remoteEngine.buildManifest(targetDeviceId, remoteDeviceName);
  const encrypted = await remoteEngine.encryptManifest(manifest, targetDeviceId);
  return encrypted!;
}

// ─── triggerSync Tests ──────────────────────────────────────────────────────

describe('SyncEngine.triggerSync', () => {
  let engine: SyncEngine;
  let transport: ReturnType<typeof createMockTransport>;
  let crypto: SyncCryptoProvider;

  const pairedDevices = [
    { deviceId: 'mobile-1', deviceName: "Sky's iPhone", deviceType: 'mobile' as const },
    { deviceId: 'mobile-2', deviceName: "Sky's iPad", deviceType: 'mobile' as const },
  ];

  beforeEach(() => {
    crypto = createMockCrypto();
    transport = createMockTransport();

    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      crypto,
      transport,
    });

    engine.registerPairedDevice('mobile-1', 'shared-secret');
    engine.registerPairedDevice('mobile-2', 'shared-secret');
  });

  it('returns error when transport is null', async () => {
    const noTransportEngine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      crypto,
      // transport not provided
    });

    const result = await noTransportEngine.triggerSync(pairedDevices);

    expect(result.status).toBe('error');
    expect(result.devicesFound).toBe(0);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBe('Sync not configured');
  });

  it('returns error when crypto is null', async () => {
    const noCryptoEngine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      // crypto not provided
      transport,
    });

    const result = await noCryptoEngine.triggerSync(pairedDevices);

    expect(result.status).toBe('error');
    expect(result.devicesFound).toBe(0);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBe('Sync not configured');
  });

  it('returns no_peer_found when no devices are reachable', async () => {
    // Neither mobile-1 nor mobile-2 is in the reachable set
    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('no_peer_found');
    expect(result.devicesFound).toBe(0);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('returns success with correct itemsSynced count', async () => {
    transport._reachable.add('mobile-1');

    // Remote device has 2 items to sync
    const remoteItems = [
      makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }),
      makeSyncItem({ id: 'cap-2', type: 'capture', sourceDeviceId: 'mobile-1' }),
    ];
    const response = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', remoteItems);
    transport.setResponse(response);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('success');
    expect(result.itemsSynced).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it('returns devicesFound count matching reachable devices', async () => {
    transport._reachable.add('mobile-1');
    transport._reachable.add('mobile-2');

    // Both devices respond with empty manifests
    const response1 = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', []);
    const response2 = await buildEncryptedResponse('mobile-2', "Sky's iPad", 'desktop-1', []);
    transport.setResponseForDevice('mobile-1', response1);
    transport.setResponseForDevice('mobile-2', response2);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.devicesFound).toBe(2);
    expect(result.status).toBe('success');
  });

  it('handles partial failure — some devices fail, some succeed', async () => {
    transport._reachable.add('mobile-1');
    transport._reachable.add('mobile-2');

    // mobile-1 responds successfully with 1 item
    const successItems = [
      makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }),
    ];
    const successResponse = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', successItems);
    transport.setResponseForDevice('mobile-1', successResponse);

    // mobile-2 fails (returns null from transport.send)
    transport.setResponseForDevice('mobile-2', null);

    const result = await engine.triggerSync(pairedDevices);

    // Status should be success because at least one device synced
    expect(result.status).toBe('success');
    expect(result.devicesFound).toBe(2);
    expect(result.itemsSynced).toBe(1);
    // Error is set because one device failed
    expect(result.error).toContain("Sky's iPad");
  });

  it('returns error status when all devices fail', async () => {
    transport._reachable.add('mobile-1');
    transport._reachable.add('mobile-2');

    // Both devices fail (null response)
    transport.setResponseForDevice('mobile-1', null);
    transport.setResponseForDevice('mobile-2', null);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('error');
    expect(result.devicesFound).toBe(2);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBeDefined();
  });

  it('works with multiple paired devices all reachable and syncing', async () => {
    transport._reachable.add('mobile-1');
    transport._reachable.add('mobile-2');

    // mobile-1 has 3 items
    const items1 = [
      makeSyncItem({ id: 'rem-1', type: 'reminder', sourceDeviceId: 'mobile-1' }),
      makeSyncItem({ id: 'rem-2', type: 'reminder', sourceDeviceId: 'mobile-1' }),
      makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }),
    ];
    const response1 = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', items1);
    transport.setResponseForDevice('mobile-1', response1);

    // mobile-2 has 2 items
    const items2 = [
      makeSyncItem({ id: 'pref-1', type: 'preference', sourceDeviceId: 'mobile-2' }),
      makeSyncItem({ id: 'pref-2', type: 'preference', sourceDeviceId: 'mobile-2' }),
    ];
    const response2 = await buildEncryptedResponse('mobile-2', "Sky's iPad", 'desktop-1', items2);
    transport.setResponseForDevice('mobile-2', response2);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('success');
    expect(result.devicesFound).toBe(2);
    expect(result.itemsSynced).toBe(5);
    expect(result.error).toBeUndefined();
  });

  it('only syncs with reachable subset of paired devices', async () => {
    // Only mobile-1 is reachable
    transport._reachable.add('mobile-1');

    const items = [
      makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }),
    ];
    const response = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', items);
    transport.setResponse(response);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('success');
    expect(result.devicesFound).toBe(1);
    expect(result.itemsSynced).toBe(1);
    // transport.send should only have been called for mobile-1
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('returns success with zero items when reachable devices have nothing to sync', async () => {
    transport._reachable.add('mobile-1');

    // Remote device has no items
    const response = await buildEncryptedResponse('mobile-1', "Sky's iPhone", 'desktop-1', []);
    transport.setResponse(response);

    const result = await engine.triggerSync(pairedDevices);

    expect(result.status).toBe('success');
    expect(result.devicesFound).toBe(1);
    expect(result.itemsSynced).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
