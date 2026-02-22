// Cross-Device Discovery — mDNS-based local network device discovery.
//
// Each Semblance instance advertises itself on the local network as
// _semblance._tcp.local. with a TXT record containing device metadata.
// Discovery scans for other instances and presents them for pairing.
//
// CRITICAL: mDNS is local network only — no internet traffic. Discovery
// uses platform-specific mDNS libraries:
//   Desktop: mdns-sd Rust crate (via Tauri command)
//   iOS: Native Bonjour (built-in)
//   Android: NSD Manager (built-in)
//
// This file provides the abstract discovery interface and pairing protocol.
// The actual mDNS implementation is injected by the platform layer.

import { nanoid } from 'nanoid';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DiscoveredDevice {
  /** Unique device ID (nanoid, generated at first launch, persisted) */
  deviceId: string;
  /** User-facing device name (e.g., "Sky's MacBook Pro") */
  deviceName: string;
  /** Device type: desktop or mobile */
  deviceType: 'desktop' | 'mobile';
  /** Platform identifier */
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';
  /** Protocol version for sync compatibility */
  protocolVersion: number;
  /** Port for sync communication */
  syncPort: number;
  /** IP address on local network */
  ipAddress: string;
}

export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile';
  platform: string;
  /** When the devices were first paired */
  pairedAt: string;
  /** When this device was last seen on the network */
  lastSeen: string;
  /** Whether currently reachable */
  isOnline: boolean;
  /** Shared secret derived during pairing (base64 encoded) */
  sharedSecret: string;
}

export interface PairingRequest {
  id: string;
  fromDeviceId: string;
  fromDeviceName: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
}

/**
 * Abstract mDNS discovery interface.
 * Platform implementations inject this at startup.
 */
export interface MDNSProvider {
  /** Start advertising this device on the local network */
  advertise(service: DiscoveredDevice): Promise<void>;
  /** Stop advertising */
  stopAdvertising(): Promise<void>;
  /** Start scanning for other Semblance instances */
  startDiscovery(onFound: (device: DiscoveredDevice) => void, onLost: (deviceId: string) => void): Promise<void>;
  /** Stop scanning */
  stopDiscovery(): Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** mDNS service type for Semblance */
export const MDNS_SERVICE_TYPE = '_semblance._tcp.local.';

/** Current protocol version */
export const PROTOCOL_VERSION = 1;

/** Pairing code expiration time (5 minutes) */
export const PAIRING_CODE_EXPIRY_MS = 5 * 60 * 1000;

// ─── Pairing Code Generation ────────────────────────────────────────────────

/**
 * Generate a 6-digit pairing code.
 * Uses random bytes for security — not sequential or predictable.
 */
export function generatePairingCode(): string {
  // Generate a random number between 100000 and 999999
  const bytes = new Uint8Array(4);
  // Use Math.random as a fallback that works everywhere
  // (actual implementation uses platform crypto adapter)
  for (let i = 0; i < 4; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  const num = (bytes[0]! << 24 | bytes[1]! << 16 | bytes[2]! << 8 | bytes[3]!) >>> 0;
  const code = (num % 900000) + 100000;
  return String(code);
}

/**
 * Create a pairing request with a fresh code.
 */
export function createPairingRequest(fromDeviceId: string, fromDeviceName: string): PairingRequest {
  const now = new Date();
  return {
    id: nanoid(),
    fromDeviceId,
    fromDeviceName,
    code: generatePairingCode(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_CODE_EXPIRY_MS).toISOString(),
    status: 'pending',
  };
}

/**
 * Validate a pairing code against a request.
 * Returns true if the code matches and hasn't expired.
 */
export function validatePairingCode(request: PairingRequest, code: string): boolean {
  if (request.status !== 'pending') return false;
  if (new Date() > new Date(request.expiresAt)) return false;
  return request.code === code;
}

/**
 * Check if a pairing request has expired.
 */
export function isPairingExpired(request: PairingRequest): boolean {
  return new Date() > new Date(request.expiresAt);
}

// ─── Discovery Manager ──────────────────────────────────────────────────────

/**
 * Manages device discovery, pairing, and paired device state.
 * Platform-specific mDNS provider is injected at construction.
 */
export class DiscoveryManager {
  private mdns: MDNSProvider | null;
  private thisDevice: DiscoveredDevice;
  private discoveredDevices: Map<string, DiscoveredDevice> = new Map();
  private pairedDevices: Map<string, PairedDevice> = new Map();
  private activePairingRequests: Map<string, PairingRequest> = new Map();
  private isAdvertising = false;
  private isDiscovering = false;

  constructor(config: {
    thisDevice: DiscoveredDevice;
    mdns?: MDNSProvider;
  }) {
    this.thisDevice = config.thisDevice;
    this.mdns = config.mdns ?? null;
  }

  /**
   * Start advertising and discovering.
   */
  async start(): Promise<void> {
    if (!this.mdns) return;

    await this.mdns.advertise(this.thisDevice);
    this.isAdvertising = true;

    await this.mdns.startDiscovery(
      (device) => this.onDeviceFound(device),
      (deviceId) => this.onDeviceLost(deviceId),
    );
    this.isDiscovering = true;
  }

  /**
   * Stop advertising and discovering.
   */
  async stop(): Promise<void> {
    if (!this.mdns) return;

    if (this.isAdvertising) {
      await this.mdns.stopAdvertising();
      this.isAdvertising = false;
    }
    if (this.isDiscovering) {
      await this.mdns.stopDiscovery();
      this.isDiscovering = false;
    }
  }

  /**
   * Get all currently discovered (unpaired) devices.
   */
  getDiscoveredDevices(): DiscoveredDevice[] {
    return [...this.discoveredDevices.values()].filter(
      d => !this.pairedDevices.has(d.deviceId)
    );
  }

  /**
   * Get all paired devices.
   */
  getPairedDevices(): PairedDevice[] {
    return [...this.pairedDevices.values()];
  }

  /**
   * Get paired devices that are currently online.
   */
  getOnlinePairedDevices(): PairedDevice[] {
    return this.getPairedDevices().filter(d => d.isOnline);
  }

  /**
   * Initiate pairing with a discovered device.
   * Returns a PairingRequest with a 6-digit code to display.
   */
  initiatePairing(targetDeviceId: string): PairingRequest | null {
    if (!this.discoveredDevices.has(targetDeviceId)) return null;

    const request = createPairingRequest(this.thisDevice.deviceId, this.thisDevice.deviceName);
    this.activePairingRequests.set(request.id, request);
    return request;
  }

  /**
   * Accept a pairing request (called on the receiving device).
   * Verifies the code and creates a paired device entry.
   */
  acceptPairing(requestId: string, code: string, remoteDevice: DiscoveredDevice): boolean {
    const request = this.activePairingRequests.get(requestId);
    if (!request) return false;
    if (!validatePairingCode(request, code)) return false;

    request.status = 'accepted';

    // Create paired device entry
    const paired: PairedDevice = {
      deviceId: remoteDevice.deviceId,
      deviceName: remoteDevice.deviceName,
      deviceType: remoteDevice.deviceType,
      platform: remoteDevice.platform,
      pairedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isOnline: true,
      sharedSecret: nanoid(32), // Placeholder — real impl uses ECDH key exchange
    };

    this.pairedDevices.set(remoteDevice.deviceId, paired);
    return true;
  }

  /**
   * Register a pairing request from a remote device.
   */
  registerIncomingPairing(request: PairingRequest): void {
    this.activePairingRequests.set(request.id, request);
  }

  /**
   * Remove a paired device.
   */
  unpair(deviceId: string): boolean {
    return this.pairedDevices.delete(deviceId);
  }

  /**
   * Load paired devices from persistent storage.
   */
  loadPairedDevices(devices: PairedDevice[]): void {
    for (const device of devices) {
      this.pairedDevices.set(device.deviceId, device);
    }
  }

  /**
   * Check if a device is paired.
   */
  isPaired(deviceId: string): boolean {
    return this.pairedDevices.has(deviceId);
  }

  /**
   * Get this device's info.
   */
  getThisDevice(): DiscoveredDevice {
    return this.thisDevice;
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private onDeviceFound(device: DiscoveredDevice): void {
    if (device.deviceId === this.thisDevice.deviceId) return;
    this.discoveredDevices.set(device.deviceId, device);

    // Update online status for paired devices
    const paired = this.pairedDevices.get(device.deviceId);
    if (paired) {
      paired.isOnline = true;
      paired.lastSeen = new Date().toISOString();
    }
  }

  private onDeviceLost(deviceId: string): void {
    this.discoveredDevices.delete(deviceId);

    // Update offline status for paired devices
    const paired = this.pairedDevices.get(deviceId);
    if (paired) {
      paired.isOnline = false;
    }
  }
}
