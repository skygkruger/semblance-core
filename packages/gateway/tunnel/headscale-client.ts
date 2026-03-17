// HeadscaleClient — Communicates with the VERIDIAN Headscale coordination server.
//
// Headscale is a phonebook, not a postman. It stores WireGuard public keys and
// current device endpoints. It assists with NAT traversal. It never sees user data.
// All calls go through the Gateway's fetch capability — audited network calls.

export interface HeadscaleConfig {
  /** VERIDIAN Headscale server URL. e.g., 'https://mesh.veridian.run' */
  serverUrl: string;
  /** Pre-auth key for device registration (one-time, from VERIDIAN dashboard) */
  authKey?: string;
  /** Machine name for this device */
  machineName: string;
  /** HTTP fetch function (Gateway's audited fetch) */
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
}

export interface HeadscalePeer {
  deviceId: string;
  displayName: string;
  platform: string;
  meshIp: string;
  publicKey: string;
  lastSeen: string;
  online: boolean;
}

export interface WireGuardConfig {
  privateKey: string;
  meshIp: string;
  listenPort: number;
  peers: WireGuardPeer[];
}

export interface WireGuardPeer {
  publicKey: string;
  allowedIps: string;
  endpoint?: string;
}

interface HeadscaleRegistrationResponse {
  machine: {
    id: string;
    name: string;
    ipAddresses: string[];
  };
}

interface HeadscaleMachinesResponse {
  machines: Array<{
    id: string;
    name: string;
    ipAddresses: string[];
    lastSeen: string;
    online: boolean;
    givenName: string;
    user?: { name: string };
  }>;
}

/**
 * HeadscaleClient communicates with the VERIDIAN Headscale REST API.
 */
export class HeadscaleClient {
  private config: HeadscaleConfig;
  private fetchFn: (url: string, options?: RequestInit) => Promise<Response>;
  private registeredDeviceId: string | null = null;
  private meshIp: string | null = null;

  constructor(config: HeadscaleConfig) {
    this.config = config;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Register this device with the Headscale server.
   * Returns the assigned mesh IP and device ID.
   */
  async register(publicKey: string): Promise<{ meshIp: string; deviceId: string }> {
    const url = `${this.config.serverUrl}/api/v1/machine/register`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authKey ? { 'Authorization': `Bearer ${this.config.authKey}` } : {}),
      },
      body: JSON.stringify({
        key: publicKey,
        name: this.config.machineName,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Headscale registration failed: ${response.status} ${text}`);
    }

    const data = await response.json() as HeadscaleRegistrationResponse;
    this.registeredDeviceId = data.machine.id;
    this.meshIp = data.machine.ipAddresses[0] ?? null;

    return {
      meshIp: this.meshIp ?? '',
      deviceId: this.registeredDeviceId,
    };
  }

  /**
   * Get the list of peers on the mesh (the user's other devices).
   */
  async getPeers(): Promise<HeadscalePeer[]> {
    const url = `${this.config.serverUrl}/api/v1/machine`;
    const response = await this.fetchFn(url, {
      headers: {
        ...(this.config.authKey ? { 'Authorization': `Bearer ${this.config.authKey}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Headscale getPeers failed: ${response.status}`);
    }

    const data = await response.json() as HeadscaleMachinesResponse;
    return data.machines
      .filter(m => m.id !== this.registeredDeviceId) // exclude self
      .map(m => ({
        deviceId: m.id,
        displayName: m.givenName || m.name,
        platform: this.inferPlatform(m.name),
        meshIp: m.ipAddresses[0] ?? '',
        publicKey: '', // Headscale API doesn't expose peer public keys directly
        lastSeen: m.lastSeen,
        online: m.online,
      }));
  }

  /**
   * Get WireGuard config for connecting to peers.
   */
  async getWireGuardConfig(privateKey: string): Promise<WireGuardConfig> {
    const peers = await this.getPeers();
    return {
      privateKey,
      meshIp: this.meshIp ?? '100.64.0.1',
      listenPort: 51820,
      peers: peers.map(p => ({
        publicKey: p.publicKey,
        allowedIps: `${p.meshIp}/32`,
        endpoint: undefined, // Headscale handles NAT traversal
      })),
    };
  }

  /**
   * Refresh peer list.
   */
  async refreshPeers(): Promise<HeadscalePeer[]> {
    return this.getPeers();
  }

  /**
   * Check if this device is registered.
   */
  async isRegistered(): Promise<boolean> {
    if (!this.registeredDeviceId) return false;
    try {
      const peers = await this.getPeers();
      // If we can list peers, we're registered
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deregister this device from the mesh.
   */
  async deregister(): Promise<void> {
    if (!this.registeredDeviceId) return;

    const url = `${this.config.serverUrl}/api/v1/machine/${this.registeredDeviceId}`;
    await this.fetchFn(url, {
      method: 'DELETE',
      headers: {
        ...(this.config.authKey ? { 'Authorization': `Bearer ${this.config.authKey}` } : {}),
      },
    });

    this.registeredDeviceId = null;
    this.meshIp = null;
  }

  /**
   * Get the registered mesh IP.
   */
  getMeshIp(): string | null {
    return this.meshIp;
  }

  /**
   * Get the registered device ID.
   */
  getDeviceId(): string | null {
    return this.registeredDeviceId;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private inferPlatform(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('mac') || lower.includes('darwin')) return 'macos';
    if (lower.includes('win')) return 'windows';
    if (lower.includes('linux')) return 'linux';
    if (lower.includes('iphone') || lower.includes('ios')) return 'ios';
    if (lower.includes('android')) return 'android';
    return 'unknown';
  }
}
