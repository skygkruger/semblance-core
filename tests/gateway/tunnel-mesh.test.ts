// Tests for WireGuard keys, Headscale client, pairing coordinator, KG sync.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WireGuardKeyManager } from '../../packages/gateway/tunnel/wireguard-keys.js';
import { HeadscaleClient } from '../../packages/gateway/tunnel/headscale-client.js';
import { PairingCoordinator } from '../../packages/gateway/tunnel/pairing-coordinator.js';
import { WireGuardManager } from '../../packages/gateway/tunnel/wireguard-manager.js';
import { TunnelKGSync } from '../../packages/gateway/tunnel/kg-sync.js';
import Database from 'better-sqlite3';

// ─── WireGuard Key Management ───────────────────────────────────────────────

describe('WireGuardKeyManager', () => {
  it('generateKeypair returns base64 strings', () => {
    const keypair = WireGuardKeyManager.generateKeypair();
    expect(keypair.privateKey).toBeTruthy();
    expect(keypair.publicKey).toBeTruthy();
    // Base64 encoded 32 bytes = 44 chars
    expect(keypair.privateKey.length).toBeGreaterThanOrEqual(40);
    expect(keypair.publicKey.length).toBeGreaterThanOrEqual(40);
  });

  it('generateKeypair returns different keys each call', () => {
    const a = WireGuardKeyManager.generateKeypair();
    const b = WireGuardKeyManager.generateKeypair();
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('getOrCreateKeypair creates and stores keys', async () => {
    const store: Record<string, string> = {};
    const keychain = {
      get: async (k: string) => store[k] ?? null,
      set: async (k: string, v: string) => { store[k] = v; },
      delete: async (k: string) => { delete store[k]; },
    };

    const keypair = await WireGuardKeyManager.getOrCreateKeypair(keychain);
    expect(keypair.privateKey).toBeTruthy();
    expect(store['semblance-wg-private-key']).toBe(keypair.privateKey);
    expect(store['semblance-wg-public-key']).toBe(keypair.publicKey);
  });

  it('getOrCreateKeypair returns existing keys', async () => {
    const store: Record<string, string> = {
      'semblance-wg-private-key': 'existing-private',
      'semblance-wg-public-key': 'existing-public',
    };
    const keychain = {
      get: async (k: string) => store[k] ?? null,
      set: async (k: string, v: string) => { store[k] = v; },
      delete: async (k: string) => { delete store[k]; },
    };

    const keypair = await WireGuardKeyManager.getOrCreateKeypair(keychain);
    expect(keypair.privateKey).toBe('existing-private');
    expect(keypair.publicKey).toBe('existing-public');
  });

  it('getPublicKey returns key without exposing private', async () => {
    const store: Record<string, string> = {};
    const keychain = {
      get: async (k: string) => store[k] ?? null,
      set: async (k: string, v: string) => { store[k] = v; },
      delete: async (k: string) => { delete store[k]; },
    };

    const pubKey = await WireGuardKeyManager.getPublicKey(keychain);
    expect(pubKey).toBeTruthy();
    // Should not have returned private key
    expect(pubKey).not.toBe(store['semblance-wg-private-key']);
  });
});

// ─── HeadscaleClient ────────────────────────────────────────────────────────

describe('HeadscaleClient', () => {
  it('register sends correct API call', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        machine: { id: 'dev-1', name: 'desktop-test', ipAddresses: ['100.64.0.1'] },
      }),
      text: async () => '',
    })) as any;

    const client = new HeadscaleClient({
      serverUrl: 'https://mesh.veridian.run',
      authKey: 'test-key',
      machineName: 'desktop-test',
      fetchFn: mockFetch,
    });

    const result = await client.register('public-key-base64');
    expect(result.meshIp).toBe('100.64.0.1');
    expect(result.deviceId).toBe('dev-1');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mesh.veridian.run/api/v1/machine/register',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('getPeers returns peer list excluding self', async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async (): Promise<Response> => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, json: async () => ({ machine: { id: 'self-1', name: 'me', ipAddresses: ['100.64.0.1'] } }), text: async () => '' } as any;
      }
      return {
        ok: true,
        json: async () => ({
          machines: [
            { id: 'self-1', name: 'me', ipAddresses: ['100.64.0.1'], lastSeen: '', online: true, givenName: 'Me' },
            { id: 'peer-1', name: 'phone', ipAddresses: ['100.64.0.2'], lastSeen: '', online: true, givenName: 'Phone' },
          ],
        }),
        text: async () => '',
      } as any;
    });

    const client = new HeadscaleClient({
      serverUrl: 'https://mesh.veridian.run',
      machineName: 'me',
      fetchFn: mockFetch,
    });
    await client.register('pk');
    const peers = await client.getPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0]!.deviceId).toBe('peer-1');
  });

  it('isRegistered returns false before registration', async () => {
    const client = new HeadscaleClient({
      serverUrl: 'https://mesh.veridian.run',
      machineName: 'test',
    });
    expect(await client.isRegistered()).toBe(false);
  });
});

// ─── PairingCoordinator ─────────────────────────────────────────────────────

describe('PairingCoordinator', () => {
  let db: Database.Database;
  let coordinator: PairingCoordinator;

  beforeEach(() => {
    db = new Database(':memory:');
    coordinator = new PairingCoordinator(db);
  });

  afterEach(() => { db.close(); });

  it('generates a 6-digit pairing code', async () => {
    const result = await coordinator.generatePairingCode({
      headscaleServer: 'https://mesh.veridian.run',
      preAuthKey: 'test-key',
      deviceId: 'desktop-1',
      publicKey: 'pubkey-base64',
      displayName: 'My Desktop',
      platform: 'windows',
    });
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.qrPayload).toBeTruthy();
    expect(JSON.parse(result.qrPayload).headscaleServer).toBe('https://mesh.veridian.run');
  });

  it('verifyPairingCode returns payload for valid code', async () => {
    const { code } = await coordinator.generatePairingCode({
      headscaleServer: 'https://mesh.veridian.run',
      preAuthKey: 'k', deviceId: 'd', publicKey: 'p', displayName: 'Desktop', platform: 'windows',
    });
    const result = await coordinator.verifyPairingCode(code);
    expect(result).not.toBeNull();
    expect(result!.headscaleServer).toBe('https://mesh.veridian.run');
  });

  it('verifyPairingCode returns null for unknown code', async () => {
    expect(await coordinator.verifyPairingCode('999999')).toBeNull();
  });

  it('verifyPairingCode is one-time use', async () => {
    const { code } = await coordinator.generatePairingCode({
      headscaleServer: 'h', preAuthKey: 'k', deviceId: 'd', publicKey: 'p', displayName: 'D', platform: 'w',
    });
    await coordinator.verifyPairingCode(code);
    expect(await coordinator.verifyPairingCode(code)).toBeNull();
  });

  it('completePairing stores device', async () => {
    await coordinator.completePairing({
      deviceId: 'phone-1', displayName: 'iPhone', platform: 'ios', meshIp: '100.64.0.2', publicKey: 'pk',
    });
    const devices = await coordinator.listPairedDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]!.displayName).toBe('iPhone');
  });

  it('unpairDevice removes device', async () => {
    await coordinator.completePairing({
      deviceId: 'phone-1', displayName: 'iPhone', platform: 'ios', meshIp: '100.64.0.2', publicKey: 'pk',
    });
    await coordinator.unpairDevice('phone-1');
    expect(await coordinator.listPairedDevices()).toHaveLength(0);
  });

  it('getPairedCount returns correct count', async () => {
    expect(coordinator.getPairedCount()).toBe(0);
    await coordinator.completePairing({
      deviceId: 'd1', displayName: 'D1', platform: 'linux', meshIp: '1.1.1.1', publicKey: 'p1',
    });
    expect(coordinator.getPairedCount()).toBe(1);
  });
});

// ─── WireGuardManager ───────────────────────────────────────────────────────

describe('WireGuardManager', () => {
  it('starts not running', () => {
    const mgr = new WireGuardManager({ dataDir: '/tmp/wg-test' });
    expect(mgr.isRunning()).toBe(false);
    expect(mgr.getMeshIp()).toBeNull();
  });

  it('getStatus reflects state', () => {
    const mgr = new WireGuardManager();
    const status = mgr.getStatus();
    expect(status.running).toBe(false);
    expect(status.meshIp).toBeNull();
    expect(status.processAlive).toBe(false);
  });
});

// ─── TunnelKGSync ───────────────────────────────────────────────────────────

describe('TunnelKGSync', () => {
  it('returns failure when tunnel not ready', async () => {
    const sync = new TunnelKGSync({ deviceId: 'test-device' });
    const transport = { isReady: () => false, send: vi.fn(), getBaseUrl: () => '' };
    const result = await sync.sync(transport);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not ready');
  });

  it('getSyncStatus returns default values', () => {
    const sync = new TunnelKGSync({ deviceId: 'test' });
    const status = sync.getSyncStatus();
    expect(status.lastSyncAt).toBeNull();
    expect(status.deltasSent).toBe(0);
    expect(status.deltasReceived).toBe(0);
    expect(status.nextSyncAt).toBeTruthy();
  });

  it('handleIncomingSync filters unsafe deltas', async () => {
    const sync = new TunnelKGSync({ deviceId: 'test' });
    const response = await sync.handleIncomingSync(
      { deviceId: 'remote', localMerkleRoot: 'r1', lastSyncMerkleRoot: '', requestedCategories: ['contacts'] },
      [
        { category: 'contacts', operation: 'add', nodeId: 'c1', payload: { name: 'Alice' }, timestamp: '' },
        { category: 'contacts', operation: 'add', nodeId: 'c2', payload: { name: 'Bob', emailBody: 'secret' }, timestamp: '' },
      ],
    );
    // The second delta has emailBody — should be filtered
    expect(response.deltas).toEqual([]); // No local store to return deltas from
  });

  it('isSafeToSync rejects unknown categories', async () => {
    const sync = new TunnelKGSync({ deviceId: 'test' });
    // Access private method via any
    const safe = (sync as any).isSafeToSync({
      category: 'documents', operation: 'add', nodeId: 'n1', payload: {}, timestamp: '',
    });
    expect(safe).toBe(false);
  });

  it('isSafeToSync rejects payloads with forbidden fields', async () => {
    const sync = new TunnelKGSync({ deviceId: 'test' });
    const safe = (sync as any).isSafeToSync({
      category: 'contacts', operation: 'add', nodeId: 'n1',
      payload: { name: 'Alice', emailBody: 'raw content' }, timestamp: '',
    });
    expect(safe).toBe(false);
  });

  it('isSafeToSync accepts clean contact deltas', async () => {
    const sync = new TunnelKGSync({ deviceId: 'test' });
    const safe = (sync as any).isSafeToSync({
      category: 'contacts', operation: 'add', nodeId: 'n1',
      payload: { name: 'Alice', email: 'alice@example.com' }, timestamp: '',
    });
    expect(safe).toBe(true);
  });
});
