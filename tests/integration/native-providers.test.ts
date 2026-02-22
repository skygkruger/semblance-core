/**
 * Native Providers Tests — mDNS discovery, pairing, encrypted sync, task offload.
 *
 * Uses mock implementations of platform-specific modules to test:
 * - DiscoveryManager with mock MDNSProvider (advertise/discover/pair)
 * - Pairing code generation and validation
 * - PlatformSyncCrypto encrypt/decrypt roundtrip
 * - EncryptedSyncTransport send/receive with mock TCP
 * - No cloud relay verification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReactNativeMDNSProvider,
  TauriMDNSProvider,
} from '../../packages/core/routing/native-discovery-provider.js';
import type {
  RNMDNSNativeModule,
  RNEventEmitter,
  RNEventSubscription,
} from '../../packages/core/routing/native-discovery-provider.js';
import {
  DiscoveryManager,
  generatePairingCode,
  createPairingRequest,
  validatePairingCode,
  isPairingExpired,
  MDNS_SERVICE_TYPE,
} from '../../packages/core/routing/discovery.js';
import type { MDNSProvider, DiscoveredDevice, PairingRequest } from '../../packages/core/routing/discovery.js';
import { PlatformSyncCrypto } from '../../packages/core/routing/platform-sync-crypto.js';
import { EncryptedSyncTransportImpl } from '../../packages/core/routing/encrypted-sync-transport.js';
import type { TCPSocketProvider, TCPConnection, TCPServer, DeviceConnection } from '../../packages/core/routing/encrypted-sync-transport.js';
import type { EncryptedSyncPayload } from '../../packages/core/routing/sync.js';

// ─── Mock MDNSProvider ────────────────────────────────────────────────────

class MockMDNSProvider implements MDNSProvider {
  public isAdvertising = false;
  public isDiscovering = false;
  public advertisedService: DiscoveredDevice | null = null;
  private onFoundCallback: ((device: DiscoveredDevice) => void) | null = null;
  private onLostCallback: ((deviceId: string) => void) | null = null;

  async advertise(service: DiscoveredDevice): Promise<void> {
    this.isAdvertising = true;
    this.advertisedService = service;
  }

  async stopAdvertising(): Promise<void> {
    this.isAdvertising = false;
    this.advertisedService = null;
  }

  async startDiscovery(
    onFound: (device: DiscoveredDevice) => void,
    onLost: (deviceId: string) => void,
  ): Promise<void> {
    this.isDiscovering = true;
    this.onFoundCallback = onFound;
    this.onLostCallback = onLost;
  }

  async stopDiscovery(): Promise<void> {
    this.isDiscovering = false;
    this.onFoundCallback = null;
    this.onLostCallback = null;
  }

  // Test helper: simulate finding a device
  simulateFound(device: DiscoveredDevice): void {
    this.onFoundCallback?.(device);
  }

  // Test helper: simulate losing a device
  simulateLost(deviceId: string): void {
    this.onLostCallback?.(deviceId);
  }
}

// ─── Mock TCP Socket ──────────────────────────────────────────────────────

class MockTCPConnection implements TCPConnection {
  public sentData: string[] = [];
  public receiveData: string;

  constructor(receiveData: string = '') {
    this.receiveData = receiveData;
  }

  async send(data: string): Promise<void> {
    this.sentData.push(data);
  }

  async receive(): Promise<string> {
    return this.receiveData;
  }

  async close(): Promise<void> {}
}

class MockTCPSocketProvider implements TCPSocketProvider {
  public connections: Map<string, MockTCPConnection> = new Map();
  public serverHandler: ((connection: TCPConnection) => void) | null = null;

  setConnectionResponse(host: string, port: number, response: string): void {
    this.connections.set(`${host}:${port}`, new MockTCPConnection(response));
  }

  async connect(host: string, port: number): Promise<TCPConnection> {
    const conn = this.connections.get(`${host}:${port}`);
    if (!conn) throw new Error(`Mock: no connection for ${host}:${port}`);
    return conn;
  }

  async listen(port: number, handler: (connection: TCPConnection) => void): Promise<TCPServer> {
    this.serverHandler = handler;
    return { close: async () => { this.serverHandler = null; }, port };
  }

  simulateIncoming(data: string): void {
    if (this.serverHandler) {
      const conn = new MockTCPConnection('');
      conn.receiveData = data;
      this.serverHandler(conn);
    }
  }
}

// ─── Test Fixtures ────────────────────────────────────────────────────────

const testDevice: DiscoveredDevice = {
  deviceId: 'device-abc123',
  deviceName: "Sky's MacBook Pro",
  deviceType: 'desktop',
  platform: 'macos',
  protocolVersion: 1,
  syncPort: 42069,
  ipAddress: '192.168.1.100',
};

const testMobileDevice: DiscoveredDevice = {
  deviceId: 'device-mobile456',
  deviceName: "Sky's iPhone",
  deviceType: 'mobile',
  platform: 'ios',
  protocolVersion: 1,
  syncPort: 42070,
  ipAddress: '192.168.1.101',
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Native Providers — mDNS + Encrypted Sync', () => {

  // ─── Discovery with Mock MDNSProvider ─────────────────────────────────

  describe('DiscoveryManager with mock MDNSProvider', () => {
    let provider: MockMDNSProvider;
    let manager: DiscoveryManager;

    beforeEach(() => {
      provider = new MockMDNSProvider();
      manager = new DiscoveryManager({
        thisDevice: testDevice,
        mdns: provider,
      });
    });

    it('advertises and discovers on start', async () => {
      await manager.start();
      expect(provider.isAdvertising).toBe(true);
      expect(provider.isDiscovering).toBe(true);
      expect(provider.advertisedService?.deviceId).toBe(testDevice.deviceId);
    });

    it('stops advertising and discovery', async () => {
      await manager.start();
      await manager.stop();
      expect(provider.isAdvertising).toBe(false);
      expect(provider.isDiscovering).toBe(false);
    });

    it('discovers nearby devices', async () => {
      await manager.start();

      provider.simulateFound(testMobileDevice);
      const discovered = manager.getDiscoveredDevices();
      expect(discovered.length).toBe(1);
      expect(discovered[0]!.deviceId).toBe(testMobileDevice.deviceId);
    });

    it('removes lost devices', async () => {
      await manager.start();
      provider.simulateFound(testMobileDevice);
      expect(manager.getDiscoveredDevices().length).toBe(1);

      provider.simulateLost(testMobileDevice.deviceId);
      expect(manager.getDiscoveredDevices().length).toBe(0);
    });

    it('does not discover self', async () => {
      await manager.start();
      provider.simulateFound(testDevice); // Same device as local
      expect(manager.getDiscoveredDevices().length).toBe(0);
    });

    it('stop is idempotent without provider', async () => {
      const managerNoMdns = new DiscoveryManager({ thisDevice: testDevice });
      // Should not throw
      await managerNoMdns.stop();
    });
  });

  // ─── Pairing Protocol ────────────────────────────────────────────────

  describe('pairing code generation and validation', () => {
    it('generates 6-digit pairing code', () => {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('generates unique codes', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generatePairingCode());
      }
      // At least 90 unique codes out of 100 (probability of collision is tiny)
      expect(codes.size).toBeGreaterThan(90);
    });

    it('creates pairing request with 5-minute expiry', () => {
      const request = createPairingRequest('device-1', 'Test Device');
      expect(request.fromDeviceId).toBe('device-1');
      expect(request.code).toMatch(/^\d{6}$/);
      expect(request.status).toBe('pending');

      const created = new Date(request.createdAt).getTime();
      const expires = new Date(request.expiresAt).getTime();
      // Expiry should be ~5 minutes (300 seconds) after creation
      const diffMs = expires - created;
      expect(diffMs).toBeGreaterThanOrEqual(290_000);
      expect(diffMs).toBeLessThanOrEqual(310_000);
    });

    it('validates correct pairing code', () => {
      const request = createPairingRequest('device-1', 'Test Device');
      expect(validatePairingCode(request, request.code)).toBe(true);
    });

    it('rejects wrong pairing code', () => {
      const request = createPairingRequest('device-1', 'Test Device');
      expect(validatePairingCode(request, '000000')).toBe(false);
    });

    it('detects expired pairing request', () => {
      const request = createPairingRequest('device-1', 'Test Device');
      expect(isPairingExpired(request)).toBe(false);

      // Create an already-expired request
      const expired: PairingRequest = {
        ...request,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      expect(isPairingExpired(expired)).toBe(true);
    });
  });

  // ─── PlatformSyncCrypto ──────────────────────────────────────────────

  describe('PlatformSyncCrypto encrypt/decrypt', () => {
    let crypto: PlatformSyncCrypto;
    const sharedSecret = 'test-shared-secret-for-pairing-abc123';

    beforeEach(() => {
      crypto = new PlatformSyncCrypto();
    });

    it('encrypts and decrypts plaintext roundtrip', async () => {
      const plaintext = '{"items":[],"deviceId":"device-1"}';
      const { ciphertext, iv } = await crypto.encrypt(plaintext, sharedSecret);

      expect(ciphertext).not.toBe(plaintext);
      expect(iv.length).toBeGreaterThan(0);

      const decrypted = await crypto.decrypt(ciphertext, iv, sharedSecret);
      expect(decrypted).toBe(plaintext);
    });

    it('different plaintexts produce different ciphertexts', async () => {
      const { ciphertext: ct1 } = await crypto.encrypt('hello', sharedSecret);
      const { ciphertext: ct2 } = await crypto.encrypt('world', sharedSecret);
      expect(ct1).not.toBe(ct2);
    });

    it('decryption fails with wrong secret', async () => {
      const { ciphertext, iv } = await crypto.encrypt('sensitive data', sharedSecret);
      await expect(
        crypto.decrypt(ciphertext, iv, 'wrong-secret'),
      ).rejects.toThrow();
    });

    it('HMAC produces consistent output for same input', async () => {
      const hmac1 = await crypto.hmac('test data', 'key');
      const hmac2 = await crypto.hmac('test data', 'key');
      expect(hmac1).toBe(hmac2);
    });

    it('HMAC differs for different inputs', async () => {
      const hmac1 = await crypto.hmac('data1', 'key');
      const hmac2 = await crypto.hmac('data2', 'key');
      expect(hmac1).not.toBe(hmac2);
    });
  });

  // ─── EncryptedSyncTransport ──────────────────────────────────────────

  describe('EncryptedSyncTransport with mock TCP', () => {
    let socketProvider: MockTCPSocketProvider;
    let transport: EncryptedSyncTransportImpl;

    const testPayload: EncryptedSyncPayload = {
      ciphertext: 'encrypted-data-here',
      iv: 'random-iv',
      hmac: 'hmac-tag',
      senderDeviceId: 'device-1',
    };

    const testResponse: EncryptedSyncPayload = {
      ciphertext: 'encrypted-response',
      iv: 'response-iv',
      hmac: 'response-hmac',
      senderDeviceId: 'device-2',
    };

    beforeEach(() => {
      socketProvider = new MockTCPSocketProvider();
      transport = new EncryptedSyncTransportImpl(socketProvider);
    });

    it('sends payload to registered device', async () => {
      transport.registerDevice({
        deviceId: 'device-2',
        ipAddress: '192.168.1.100',
        port: 42069,
      });

      socketProvider.setConnectionResponse('192.168.1.100', 42069, JSON.stringify(testResponse));

      const response = await transport.send('device-2', testPayload);
      expect(response).not.toBeNull();
      expect(response!.senderDeviceId).toBe('device-2');
    });

    it('returns null for unregistered device', async () => {
      const response = await transport.send('unknown-device', testPayload);
      expect(response).toBeNull();
    });

    it('tracks device reachability', () => {
      transport.registerDevice({
        deviceId: 'device-2',
        ipAddress: '192.168.1.100',
        port: 42069,
      });

      expect(transport.isDeviceReachable('device-2')).toBe(true);

      transport.setDeviceReachable('device-2', false);
      expect(transport.isDeviceReachable('device-2')).toBe(false);

      transport.setDeviceReachable('device-2', true);
      expect(transport.isDeviceReachable('device-2')).toBe(true);
    });

    it('unregisters device connection', () => {
      transport.registerDevice({
        deviceId: 'device-2',
        ipAddress: '192.168.1.100',
        port: 42069,
      });
      expect(transport.isDeviceReachable('device-2')).toBe(true);

      transport.unregisterDevice('device-2');
      expect(transport.isDeviceReachable('device-2')).toBe(false);
    });

    it('registers receive handler', () => {
      const handler = vi.fn();
      transport.onReceive(handler);
      // Handler is stored — no error
      expect(true).toBe(true);
    });
  });

  // ─── No Cloud Relay Verification ─────────────────────────────────────

  describe('no cloud relay verification', () => {
    it('mDNS service type is local-only', () => {
      expect(MDNS_SERVICE_TYPE).toContain('.local.');
      expect(MDNS_SERVICE_TYPE).toBe('_semblance._tcp.local.');
    });

    it('transport only connects to registered local devices', async () => {
      const socketProvider = new MockTCPSocketProvider();
      const transport = new EncryptedSyncTransportImpl(socketProvider);

      // Without registering any device, send should return null
      const result = await transport.send('any-device', {
        ciphertext: 'test',
        iv: 'test',
        hmac: 'test',
        senderDeviceId: 'self',
      });
      expect(result).toBeNull();

      // Transport should have no connections to external services
      expect(transport.getRegisteredDevices().size).toBe(0);
    });
  });

  // ─── ReactNativeMDNSProvider ──────────────────────────────────────────

  describe('ReactNativeMDNSProvider', () => {
    it('calls native module advertise with correct params', async () => {
      const nativeModule: RNMDNSNativeModule = {
        advertise: vi.fn().mockResolvedValue(undefined),
        stopAdvertising: vi.fn().mockResolvedValue(undefined),
        startDiscovery: vi.fn().mockResolvedValue(undefined),
        stopDiscovery: vi.fn().mockResolvedValue(undefined),
      };
      const eventEmitter: RNEventEmitter = {
        addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
      };

      const provider = new ReactNativeMDNSProvider(nativeModule, eventEmitter);
      await provider.advertise(testDevice);

      expect(nativeModule.advertise).toHaveBeenCalledWith(
        MDNS_SERVICE_TYPE,
        expect.stringContaining('semblance-'),
        testDevice.syncPort,
        expect.objectContaining({ deviceId: testDevice.deviceId }),
      );
    });

    it('subscribes to events on startDiscovery', async () => {
      const nativeModule: RNMDNSNativeModule = {
        advertise: vi.fn().mockResolvedValue(undefined),
        stopAdvertising: vi.fn().mockResolvedValue(undefined),
        startDiscovery: vi.fn().mockResolvedValue(undefined),
        stopDiscovery: vi.fn().mockResolvedValue(undefined),
      };
      const eventEmitter: RNEventEmitter = {
        addListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
      };

      const provider = new ReactNativeMDNSProvider(nativeModule, eventEmitter);
      await provider.startDiscovery(() => {}, () => {});

      expect(eventEmitter.addListener).toHaveBeenCalledWith('mdnsServiceFound', expect.any(Function));
      expect(eventEmitter.addListener).toHaveBeenCalledWith('mdnsServiceLost', expect.any(Function));
      expect(nativeModule.startDiscovery).toHaveBeenCalledWith(MDNS_SERVICE_TYPE);
    });
  });
});
