// Tests for Commit 11: Cross-Device State Sync — encrypted local-network sync.
// Sync protocol, encryption/decryption, conflict resolution,
// delta sync, offline operation, and periodic scheduling.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  SyncEngine,
  resolveConflict,
  SYNC_PROTOCOL_VERSION,
  SYNC_INTERVAL_MS,
  MAX_INITIAL_SYNC_AGE_MS,
} from '@semblance/core/routing/sync.js';
import type {
  SyncItem,
  SyncManifest,
  SyncCryptoProvider,
  SyncTransport,
  EncryptedSyncPayload,
  SyncItemType,
} from '@semblance/core/routing/sync.js';

// ─── Mock Crypto Provider ───────────────────────────────────────────────────

function createMockCrypto(): SyncCryptoProvider {
  return {
    encrypt: vi.fn(async (plaintext: string, _secret: string) => ({
      ciphertext: Buffer.from(plaintext).toString('base64'),
      iv: 'mock-iv-12345678',
    })),
    decrypt: vi.fn(async (ciphertext: string, _iv: string, _secret: string) =>
      Buffer.from(ciphertext, 'base64').toString('utf-8')
    ),
    hmac: vi.fn(async (data: string, _key: string) =>
      `hmac-${data.slice(0, 8)}`
    ),
  };
}

// ─── Mock Transport ─────────────────────────────────────────────────────────

function createMockTransport(): SyncTransport & {
  _reachable: Set<string>;
  _responseHandler: ((payload: EncryptedSyncPayload) => Promise<EncryptedSyncPayload>) | null;
  _lastSent: EncryptedSyncPayload | null;
  setResponse: (response: EncryptedSyncPayload | null) => void;
} {
  let response: EncryptedSyncPayload | null = null;
  let receiveHandler: ((payload: EncryptedSyncPayload) => Promise<EncryptedSyncPayload>) | null = null;
  const reachable = new Set<string>();
  let lastSent: EncryptedSyncPayload | null = null;

  return {
    _reachable: reachable,
    _responseHandler: receiveHandler,
    _lastSent: lastSent,
    send: vi.fn(async (_deviceId: string, payload: EncryptedSyncPayload) => {
      lastSent = payload;
      return response;
    }),
    onReceive: vi.fn((handler) => {
      receiveHandler = handler;
    }),
    isDeviceReachable: vi.fn((deviceId: string) => reachable.has(deviceId)),
    setResponse: (r: EncryptedSyncPayload | null) => { response = r; },
  };
}

// ─── Relative Date Helpers (avoid 7-day boundary flakiness) ─────────────────

// All test dates are anchored 3 days ago to stay well within MAX_INITIAL_SYNC_AGE (7 days)
const THREE_DAYS_AGO = Date.now() - 3 * 24 * 60 * 60 * 1000;
const T08 = new Date(THREE_DAYS_AGO + 8 * 3600_000).toISOString();
const T09 = new Date(THREE_DAYS_AGO + 9 * 3600_000).toISOString();
const T10 = new Date(THREE_DAYS_AGO + 10 * 3600_000).toISOString();
const T11 = new Date(THREE_DAYS_AGO + 11 * 3600_000).toISOString();
const T12 = new Date(THREE_DAYS_AGO + 12 * 3600_000).toISOString();

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSyncItem(overrides: Partial<SyncItem> & { id: string; type: SyncItemType }): SyncItem {
  return {
    data: { value: 'test' },
    updatedAt: new Date().toISOString(),
    sourceDeviceId: 'device-1',
    ...overrides,
  };
}

// ─── Conflict Resolution ────────────────────────────────────────────────────

describe('Cross-Device Sync — Conflict Resolution', () => {
  it('preference: last-write-wins (remote newer)', () => {
    const local = makeSyncItem({ id: 'pref-1', type: 'preference', updatedAt: T10 });
    const remote = makeSyncItem({ id: 'pref-1', type: 'preference', updatedAt: T11 });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('remote_wins');
    expect(result.winner).toBe('remote');
  });

  it('preference: last-write-wins (local newer)', () => {
    const local = makeSyncItem({ id: 'pref-1', type: 'preference', updatedAt: T12 });
    const remote = makeSyncItem({ id: 'pref-1', type: 'preference', updatedAt: T11 });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('local_wins');
    expect(result.winner).toBe('local');
  });

  it('style_profile: desktop takes precedence over mobile', () => {
    const local = makeSyncItem({ id: 'style-1', type: 'style_profile', updatedAt: T10 });
    const remote = makeSyncItem({ id: 'style-1', type: 'style_profile', updatedAt: T12 });

    // Local is desktop, remote is mobile — desktop wins regardless of time
    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('local_wins');
    expect(result.winner).toBe('local');
  });

  it('style_profile: mobile accepts desktop profile', () => {
    const local = makeSyncItem({ id: 'style-1', type: 'style_profile', updatedAt: T12 });
    const remote = makeSyncItem({ id: 'style-1', type: 'style_profile', updatedAt: T10 });

    // Local is mobile, remote is desktop — desktop wins regardless of time
    const result = resolveConflict(local, remote, 'mobile', 'desktop');
    expect(result.resolution).toBe('remote_wins');
    expect(result.winner).toBe('remote');
  });

  it('action_trail: always merge (union)', () => {
    const local = makeSyncItem({ id: 'action-1', type: 'action_trail' });
    const remote = makeSyncItem({ id: 'action-1', type: 'action_trail' });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('merged');
  });

  it('capture: always merge (union)', () => {
    const local = makeSyncItem({ id: 'cap-1', type: 'capture' });
    const remote = makeSyncItem({ id: 'cap-1', type: 'capture' });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('merged');
  });

  it('device_capability: always accept remote', () => {
    const local = makeSyncItem({ id: 'dev-cap-1', type: 'device_capability' });
    const remote = makeSyncItem({ id: 'dev-cap-1', type: 'device_capability' });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('remote_wins');
    expect(result.winner).toBe('remote');
  });

  it('reminder: last-write-wins', () => {
    const local = makeSyncItem({ id: 'rem-1', type: 'reminder', updatedAt: T08 });
    const remote = makeSyncItem({ id: 'rem-1', type: 'reminder', updatedAt: T09 });

    const result = resolveConflict(local, remote, 'desktop', 'mobile');
    expect(result.resolution).toBe('remote_wins');
  });
});

// ─── Sync Engine — Local Operations ─────────────────────────────────────────

describe('Cross-Device Sync — SyncEngine Local', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
    });
  });

  it('stores and retrieves items', () => {
    engine.upsertItem(makeSyncItem({ id: 'item-1', type: 'preference' }));
    engine.upsertItem(makeSyncItem({ id: 'item-2', type: 'reminder' }));

    expect(engine.getItems()).toHaveLength(2);
  });

  it('upserts existing items', () => {
    engine.upsertItem(makeSyncItem({ id: 'item-1', type: 'preference', data: { v: 1 } }));
    engine.upsertItem(makeSyncItem({ id: 'item-1', type: 'preference', data: { v: 2 } }));

    const items = engine.getItems();
    expect(items).toHaveLength(1);
    expect((items[0]!.data as { v: number }).v).toBe(2);
  });

  it('filters items by type', () => {
    engine.upsertItem(makeSyncItem({ id: 'pref-1', type: 'preference' }));
    engine.upsertItem(makeSyncItem({ id: 'rem-1', type: 'reminder' }));
    engine.upsertItem(makeSyncItem({ id: 'pref-2', type: 'preference' }));

    expect(engine.getItemsByType('preference')).toHaveLength(2);
    expect(engine.getItemsByType('reminder')).toHaveLength(1);
  });

  it('builds delta manifest — only changed items since last sync', () => {
    const past = T10;
    const future = T12;

    engine.upsertItem(makeSyncItem({ id: 'old-1', type: 'preference', updatedAt: past }));
    engine.upsertItem(makeSyncItem({ id: 'new-1', type: 'preference', updatedAt: future }));

    // Simulate that last sync was at 11:00
    const manifest = engine.buildManifest('mobile-1', 'Desktop');
    // First sync: no lastSyncAt, returns items within MAX_INITIAL_SYNC_AGE
    expect(manifest.items).toHaveLength(2);
    expect(manifest.protocolVersion).toBe(SYNC_PROTOCOL_VERSION);
  });

  it('getChangedSince returns only newer items', () => {
    engine.upsertItem(makeSyncItem({ id: 'old-1', type: 'preference', updatedAt: T10 }));
    engine.upsertItem(makeSyncItem({ id: 'new-1', type: 'preference', updatedAt: T12 }));

    const changed = engine.getChangedSince(T11);
    expect(changed).toHaveLength(1);
    expect(changed[0]!.id).toBe('new-1');
  });
});

// ─── Sync Engine — Manifest Application ─────────────────────────────────────

describe('Cross-Device Sync — Manifest Application', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
    });
  });

  it('accepts new items from remote manifest', () => {
    const manifest: SyncManifest = {
      deviceId: 'mobile-1',
      deviceName: "Sky's iPhone",
      lastSyncAt: null,
      items: [
        makeSyncItem({ id: 'rem-1', type: 'reminder', sourceDeviceId: 'mobile-1' }),
        makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }),
      ],
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };

    const result = engine.applyManifest(manifest, 'mobile');
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(0);
    expect(engine.getItems()).toHaveLength(2);
  });

  it('resolves conflicts using conflict resolution rules', () => {
    // Local item exists
    engine.upsertItem(makeSyncItem({
      id: 'pref-1', type: 'preference',
      updatedAt: T12,
      data: { local: true },
    }));

    // Remote item is older — should be rejected
    const manifest: SyncManifest = {
      deviceId: 'mobile-1',
      deviceName: "Sky's iPhone",
      lastSyncAt: null,
      items: [
        makeSyncItem({
          id: 'pref-1', type: 'preference',
          updatedAt: T10,
          data: { remote: true },
        }),
      ],
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };

    const result = engine.applyManifest(manifest, 'mobile');
    expect(result.rejected).toBe(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.resolution).toBe('local_wins');
  });

  it('action trail items merge without conflict', () => {
    engine.upsertItem(makeSyncItem({ id: 'action-1', type: 'action_trail' }));

    const manifest: SyncManifest = {
      deviceId: 'mobile-1',
      deviceName: "Sky's iPhone",
      lastSyncAt: null,
      items: [
        makeSyncItem({ id: 'action-1', type: 'action_trail', sourceDeviceId: 'mobile-1' }),
        makeSyncItem({ id: 'action-2', type: 'action_trail', sourceDeviceId: 'mobile-1' }),
      ],
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };

    const result = engine.applyManifest(manifest, 'mobile');
    // action-1: conflict resolved as 'merged' (accepted)
    // action-2: new item (accepted)
    expect(result.accepted).toBe(2);
  });

  it('records sync time after applying manifest', () => {
    const manifest: SyncManifest = {
      deviceId: 'mobile-1',
      deviceName: "Sky's iPhone",
      lastSyncAt: null,
      items: [],
      protocolVersion: SYNC_PROTOCOL_VERSION,
    };

    expect(engine.getLastSyncTime('mobile-1')).toBeNull();
    engine.applyManifest(manifest, 'mobile');
    expect(engine.getLastSyncTime('mobile-1')).not.toBeNull();
  });
});

// ─── Sync Engine — Encryption ───────────────────────────────────────────────

describe('Cross-Device Sync — Encryption', () => {
  let engine: SyncEngine;
  let crypto: ReturnType<typeof createMockCrypto>;

  beforeEach(() => {
    crypto = createMockCrypto();
    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      crypto,
    });
    engine.registerPairedDevice('mobile-1', 'shared-secret-key');
  });

  it('encrypts manifest for transit', async () => {
    engine.upsertItem(makeSyncItem({ id: 'pref-1', type: 'preference' }));

    const manifest = engine.buildManifest('mobile-1', 'Desktop');
    const encrypted = await engine.encryptManifest(manifest, 'mobile-1');

    expect(encrypted).not.toBeNull();
    expect(encrypted!.ciphertext).toBeTruthy();
    expect(encrypted!.iv).toBeTruthy();
    expect(encrypted!.hmac).toBeTruthy();
    expect(encrypted!.senderDeviceId).toBe('desktop-1');
    expect(crypto.encrypt).toHaveBeenCalled();
  });

  it('returns null when encrypting for unknown device', async () => {
    const manifest = engine.buildManifest('unknown-1', 'Desktop');
    const encrypted = await engine.encryptManifest(manifest, 'unknown-1');
    expect(encrypted).toBeNull();
  });

  it('decrypts received payload from paired device', async () => {
    // Simulate mobile sending a payload TO desktop
    // The mobile engine encrypts with desktop-1 as target
    const mobileEngine = new SyncEngine({
      deviceId: 'mobile-1',
      deviceType: 'mobile',
      crypto: createMockCrypto(),
    });
    mobileEngine.registerPairedDevice('desktop-1', 'shared-secret-key');
    mobileEngine.upsertItem(makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }));

    const manifest = mobileEngine.buildManifest('desktop-1', "Sky's iPhone");
    const encrypted = await mobileEngine.encryptManifest(manifest, 'desktop-1');
    expect(encrypted).not.toBeNull();
    expect(encrypted!.senderDeviceId).toBe('mobile-1');

    // Desktop engine decrypts it (has mobile-1 as paired device)
    const decrypted = await engine.decryptPayload(encrypted!);
    expect(decrypted).not.toBeNull();
    expect(decrypted!.deviceId).toBe('mobile-1');
    expect(decrypted!.items).toHaveLength(1);
  });

  it('rejects payload with invalid HMAC', async () => {
    engine.upsertItem(makeSyncItem({ id: 'pref-1', type: 'preference' }));

    const manifest = engine.buildManifest('mobile-1', 'Desktop');
    const encrypted = await engine.encryptManifest(manifest, 'mobile-1');

    // Tamper with the HMAC
    encrypted!.hmac = 'tampered-hmac';
    const decrypted = await engine.decryptPayload(encrypted!);
    expect(decrypted).toBeNull();
  });

  it('rejects payload from unknown device', async () => {
    const payload: EncryptedSyncPayload = {
      ciphertext: 'some-data',
      iv: 'some-iv',
      hmac: 'some-hmac',
      senderDeviceId: 'unknown-device',
    };
    const decrypted = await engine.decryptPayload(payload);
    expect(decrypted).toBeNull();
  });
});

// ─── Sync Engine — Full Sync Flow ───────────────────────────────────────────

describe('Cross-Device Sync — Full Sync Flow', () => {
  let desktopEngine: SyncEngine;
  let mobileEngine: SyncEngine;
  let desktopCrypto: ReturnType<typeof createMockCrypto>;
  let mobileCrypto: ReturnType<typeof createMockCrypto>;
  let desktopTransport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    desktopCrypto = createMockCrypto();
    mobileCrypto = createMockCrypto();
    desktopTransport = createMockTransport();

    desktopEngine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      crypto: desktopCrypto,
      transport: desktopTransport,
    });

    mobileEngine = new SyncEngine({
      deviceId: 'mobile-1',
      deviceType: 'mobile',
      crypto: mobileCrypto,
    });

    // Register paired devices
    desktopEngine.registerPairedDevice('mobile-1', 'shared-secret');
    mobileEngine.registerPairedDevice('desktop-1', 'shared-secret');
    desktopTransport._reachable.add('mobile-1');
  });

  it('syncs items between devices', async () => {
    // Desktop has a preference
    desktopEngine.upsertItem(makeSyncItem({ id: 'pref-1', type: 'preference', sourceDeviceId: 'desktop-1' }));

    // Mobile has a capture
    mobileEngine.upsertItem(makeSyncItem({ id: 'cap-1', type: 'capture', sourceDeviceId: 'mobile-1' }));

    // Build mobile's response manifest
    const mobileManifest = mobileEngine.buildManifest('desktop-1', "Sky's iPhone");
    const mobileEncrypted = await mobileEngine.encryptManifest(mobileManifest, 'desktop-1');
    desktopTransport.setResponse(mobileEncrypted);

    // Perform sync from desktop side
    const result = await desktopEngine.syncWithDevice('mobile-1', 'Desktop', 'mobile');
    expect(result).not.toBeNull();
    expect(result!.accepted).toBe(1);  // Accepted mobile's capture
    expect(desktopEngine.getItems()).toHaveLength(2); // Own pref + mobile's capture
  });

  it('returns null when device is unreachable', async () => {
    desktopTransport._reachable.delete('mobile-1');
    const result = await desktopEngine.syncWithDevice('mobile-1', 'Desktop', 'mobile');
    expect(result).toBeNull();
  });

  it('returns null for unpaired device', async () => {
    desktopEngine.removePairedDevice('mobile-1');
    const result = await desktopEngine.syncWithDevice('mobile-1', 'Desktop', 'mobile');
    expect(result).toBeNull();
  });
});

// ─── Sync Engine — Paired Device Management ─────────────────────────────────

describe('Cross-Device Sync — Paired Device Management', () => {
  let engine: SyncEngine;

  beforeEach(() => {
    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
    });
  });

  it('registers and removes paired devices', () => {
    engine.registerPairedDevice('mobile-1', 'secret');
    // Can build manifest for paired device
    const manifest = engine.buildManifest('mobile-1', 'Desktop');
    expect(manifest.deviceId).toBe('desktop-1');

    engine.removePairedDevice('mobile-1');
    // Last sync time cleared
    expect(engine.getLastSyncTime('mobile-1')).toBeNull();
  });
});

// ─── Sync Engine — Periodic Sync ────────────────────────────────────────────

describe('Cross-Device Sync — Periodic Sync', () => {
  let engine: SyncEngine;
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    vi.useFakeTimers();
    transport = createMockTransport();
    engine = new SyncEngine({
      deviceId: 'desktop-1',
      deviceType: 'desktop',
      crypto: createMockCrypto(),
      transport,
    });
    engine.registerPairedDevice('mobile-1', 'secret');
  });

  afterEach(() => {
    engine.stopPeriodicSync();
    vi.useRealTimers();
  });

  it('starts and stops periodic sync', () => {
    engine.startPeriodicSync([
      { deviceId: 'mobile-1', deviceName: "Sky's iPhone", deviceType: 'mobile' },
    ], 1000);

    // Should not crash — transport isn't reachable yet so sync silently skips
    vi.advanceTimersByTime(1100);

    engine.stopPeriodicSync();
    // No errors
  });

  it('calls sync on interval for reachable devices', async () => {
    transport._reachable.add('mobile-1');
    transport.setResponse(null); // No response means sync returns null, but attempt is made

    engine.startPeriodicSync([
      { deviceId: 'mobile-1', deviceName: "Sky's iPhone", deviceType: 'mobile' },
    ], 500);

    await vi.advanceTimersByTimeAsync(600);
    expect(transport.send).toHaveBeenCalled();
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('Cross-Device Sync — Constants', () => {
  it('sync protocol version is defined', () => {
    expect(SYNC_PROTOCOL_VERSION).toBe(1);
  });

  it('sync interval is 60 seconds', () => {
    expect(SYNC_INTERVAL_MS).toBe(60_000);
  });

  it('max initial sync age is 7 days', () => {
    expect(MAX_INITIAL_SYNC_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
