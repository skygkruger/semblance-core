// Tests for Commit 10: Cross-Device Discovery — mDNS.
// mDNS advertisement/discovery (mock network layer), pairing flow,
// paired device persistence, duplicate handling.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DiscoveryManager,
  generatePairingCode,
  createPairingRequest,
  validatePairingCode,
  isPairingExpired,
  PAIRING_CODE_EXPIRY_MS,
  MDNS_SERVICE_TYPE,
  PROTOCOL_VERSION,
} from '@semblance/core/routing/discovery.js';
import type { DiscoveredDevice, MDNSProvider, PairedDevice } from '@semblance/core/routing/discovery.js';

// ─── Mock mDNS Provider ─────────────────────────────────────────────────────

function createMockMDNS(): MDNSProvider & {
  _onFound?: (device: DiscoveredDevice) => void;
  _onLost?: (deviceId: string) => void;
  simulateFound: (device: DiscoveredDevice) => void;
  simulateLost: (deviceId: string) => void;
} {
  let onFound: ((device: DiscoveredDevice) => void) | undefined;
  let onLost: ((deviceId: string) => void) | undefined;

  return {
    advertise: vi.fn(async () => {}),
    stopAdvertising: vi.fn(async () => {}),
    startDiscovery: vi.fn(async (found, lost) => {
      onFound = found;
      onLost = lost;
    }),
    stopDiscovery: vi.fn(async () => {}),
    get _onFound() { return onFound; },
    get _onLost() { return onLost; },
    simulateFound: (device) => onFound?.(device),
    simulateLost: (deviceId) => onLost?.(deviceId),
  };
}

const THIS_DEVICE: DiscoveredDevice = {
  deviceId: 'device-desktop-1',
  deviceName: "Sky's MacBook Pro",
  deviceType: 'desktop',
  platform: 'macos',
  protocolVersion: PROTOCOL_VERSION,
  syncPort: 18432,
  ipAddress: '192.168.1.10',
};

const REMOTE_PHONE: DiscoveredDevice = {
  deviceId: 'device-mobile-1',
  deviceName: "Sky's iPhone",
  deviceType: 'mobile',
  platform: 'ios',
  protocolVersion: PROTOCOL_VERSION,
  syncPort: 18432,
  ipAddress: '192.168.1.20',
};

// ─── Pairing Code Generation ────────────────────────────────────────────────

describe('mDNS Discovery — Pairing Codes', () => {
  it('generates 6-digit codes', () => {
    const code = generatePairingCode();
    expect(code).toHaveLength(6);
    expect(parseInt(code, 10)).toBeGreaterThanOrEqual(100000);
    expect(parseInt(code, 10)).toBeLessThanOrEqual(999999);
  });

  it('generates different codes on successive calls', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(generatePairingCode());
    }
    // At least some should be different (statistically near-certain)
    expect(codes.size).toBeGreaterThan(1);
  });

  it('creates a pairing request with valid fields', () => {
    const request = createPairingRequest('dev-1', "Sky's Device");
    expect(request.id).toBeTruthy();
    expect(request.fromDeviceId).toBe('dev-1');
    expect(request.fromDeviceName).toBe("Sky's Device");
    expect(request.code).toHaveLength(6);
    expect(request.status).toBe('pending');
    expect(new Date(request.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('validates correct pairing code', () => {
    const request = createPairingRequest('dev-1', 'Device');
    expect(validatePairingCode(request, request.code)).toBe(true);
  });

  it('rejects wrong pairing code', () => {
    const request = createPairingRequest('dev-1', 'Device');
    expect(validatePairingCode(request, '000000')).toBe(false);
  });

  it('rejects expired pairing code', () => {
    const request = createPairingRequest('dev-1', 'Device');
    // Manually expire it
    request.expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(validatePairingCode(request, request.code)).toBe(false);
    expect(isPairingExpired(request)).toBe(true);
  });

  it('rejects already-accepted pairing request', () => {
    const request = createPairingRequest('dev-1', 'Device');
    request.status = 'accepted';
    expect(validatePairingCode(request, request.code)).toBe(false);
  });
});

// ─── Discovery Manager — mDNS ──────────────────────────────────────────────

describe('mDNS Discovery — Discovery Manager', () => {
  let manager: DiscoveryManager;
  let mdns: ReturnType<typeof createMockMDNS>;

  beforeEach(async () => {
    mdns = createMockMDNS();
    manager = new DiscoveryManager({
      thisDevice: THIS_DEVICE,
      mdns,
    });
    await manager.start();
  });

  it('starts advertising and discovery', () => {
    expect(mdns.advertise).toHaveBeenCalledWith(THIS_DEVICE);
    expect(mdns.startDiscovery).toHaveBeenCalled();
  });

  it('discovers remote devices', () => {
    mdns.simulateFound(REMOTE_PHONE);

    const discovered = manager.getDiscoveredDevices();
    expect(discovered).toHaveLength(1);
    expect(discovered[0]!.deviceId).toBe('device-mobile-1');
    expect(discovered[0]!.deviceName).toBe("Sky's iPhone");
  });

  it('ignores own device in discovery', () => {
    mdns.simulateFound(THIS_DEVICE);
    expect(manager.getDiscoveredDevices()).toHaveLength(0);
  });

  it('removes lost devices', () => {
    mdns.simulateFound(REMOTE_PHONE);
    expect(manager.getDiscoveredDevices()).toHaveLength(1);

    mdns.simulateLost('device-mobile-1');
    expect(manager.getDiscoveredDevices()).toHaveLength(0);
  });

  it('handles duplicate device discoveries', () => {
    mdns.simulateFound(REMOTE_PHONE);
    mdns.simulateFound(REMOTE_PHONE);
    expect(manager.getDiscoveredDevices()).toHaveLength(1);
  });

  it('stops advertising and discovery', async () => {
    await manager.stop();
    expect(mdns.stopAdvertising).toHaveBeenCalled();
    expect(mdns.stopDiscovery).toHaveBeenCalled();
  });
});

// ─── Discovery Manager — Pairing ────────────────────────────────────────────

describe('mDNS Discovery — Pairing Flow', () => {
  let manager: DiscoveryManager;
  let mdns: ReturnType<typeof createMockMDNS>;

  beforeEach(async () => {
    mdns = createMockMDNS();
    manager = new DiscoveryManager({
      thisDevice: THIS_DEVICE,
      mdns,
    });
    await manager.start();
    mdns.simulateFound(REMOTE_PHONE);
  });

  it('initiates pairing with discovered device', () => {
    const request = manager.initiatePairing('device-mobile-1');
    expect(request).not.toBeNull();
    expect(request!.code).toHaveLength(6);
    expect(request!.fromDeviceId).toBe('device-desktop-1');
  });

  it('returns null when initiating pairing with unknown device', () => {
    const request = manager.initiatePairing('nonexistent');
    expect(request).toBeNull();
  });

  it('accepts pairing with correct code', () => {
    const request = manager.initiatePairing('device-mobile-1')!;
    manager.registerIncomingPairing(request);

    const accepted = manager.acceptPairing(request.id, request.code, REMOTE_PHONE);
    expect(accepted).toBe(true);
    expect(manager.isPaired('device-mobile-1')).toBe(true);
  });

  it('rejects pairing with wrong code', () => {
    const request = manager.initiatePairing('device-mobile-1')!;
    manager.registerIncomingPairing(request);

    const accepted = manager.acceptPairing(request.id, '000000', REMOTE_PHONE);
    expect(accepted).toBe(false);
    expect(manager.isPaired('device-mobile-1')).toBe(false);
  });

  it('paired device appears in paired list, not discovered', () => {
    const request = manager.initiatePairing('device-mobile-1')!;
    manager.registerIncomingPairing(request);
    manager.acceptPairing(request.id, request.code, REMOTE_PHONE);

    expect(manager.getPairedDevices()).toHaveLength(1);
    expect(manager.getDiscoveredDevices()).toHaveLength(0); // Filtered out
  });

  it('unpairs a device', () => {
    const request = manager.initiatePairing('device-mobile-1')!;
    manager.registerIncomingPairing(request);
    manager.acceptPairing(request.id, request.code, REMOTE_PHONE);

    expect(manager.unpair('device-mobile-1')).toBe(true);
    expect(manager.isPaired('device-mobile-1')).toBe(false);
    expect(manager.getPairedDevices()).toHaveLength(0);
  });
});

// ─── Discovery Manager — Online Status ──────────────────────────────────────

describe('mDNS Discovery — Paired Device Status', () => {
  let manager: DiscoveryManager;
  let mdns: ReturnType<typeof createMockMDNS>;

  beforeEach(async () => {
    mdns = createMockMDNS();
    manager = new DiscoveryManager({
      thisDevice: THIS_DEVICE,
      mdns,
    });
    await manager.start();

    // Pre-load a paired device
    manager.loadPairedDevices([{
      deviceId: 'device-mobile-1',
      deviceName: "Sky's iPhone",
      deviceType: 'mobile',
      platform: 'ios',
      pairedAt: '2026-02-01T00:00:00Z',
      lastSeen: '2026-02-20T00:00:00Z',
      isOnline: false,
      sharedSecret: 'test-secret-key',
    }]);
  });

  it('updates paired device to online when discovered', () => {
    expect(manager.getOnlinePairedDevices()).toHaveLength(0);
    mdns.simulateFound(REMOTE_PHONE);
    expect(manager.getOnlinePairedDevices()).toHaveLength(1);
  });

  it('updates paired device to offline when lost', () => {
    mdns.simulateFound(REMOTE_PHONE);
    expect(manager.getOnlinePairedDevices()).toHaveLength(1);

    mdns.simulateLost('device-mobile-1');
    expect(manager.getOnlinePairedDevices()).toHaveLength(0);
  });

  it('loads paired devices from persistent storage', () => {
    expect(manager.getPairedDevices()).toHaveLength(1);
    expect(manager.isPaired('device-mobile-1')).toBe(true);
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('mDNS Discovery — Constants', () => {
  it('service type is _semblance._tcp.local.', () => {
    expect(MDNS_SERVICE_TYPE).toBe('_semblance._tcp.local.');
  });

  it('protocol version is defined', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  it('pairing code expires in 5 minutes', () => {
    expect(PAIRING_CODE_EXPIRY_MS).toBe(5 * 60 * 1000);
  });
});
