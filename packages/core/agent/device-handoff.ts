// Device Handoff Protocol — Desktop discovery and task offloading between paired devices.
//
// Defines the protocol for mobile <-> desktop task handoff over the WireGuard tunnel.
// Transport is injectable — works with TunnelTransport when available, no-op otherwise.
// Uses mutual TLS authentication (handled at the WireGuard layer, not application layer).
//
// CRITICAL: This file is in packages/core/. No network imports.
// All network operations are delegated to the injectable transport.

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Transport interface for device-to-device communication.
 * Subset of TunnelTransport — allows injection of any compatible transport.
 */
export interface HandoffTransport {
  isReady(): boolean;
  send(request: unknown): Promise<unknown>;
  getRemoteDeviceId(): string | null;
}

/**
 * A task offload request sent from one device to another.
 */
export interface HandoffRequest {
  /** Type of task to execute (maps to orchestrator task types). */
  taskType: string;
  /** The task payload (prompt, tool context, etc.). */
  payload: Record<string, unknown>;
  /** Estimated token count for the task. */
  estimatedTokens: number;
  /** Platform of the requesting device. */
  sourcePlatform: 'desktop' | 'mobile';
  /** Unique ID of the requesting device. */
  sourceDeviceId: string;
}

/**
 * Response from a device that executed an offloaded task.
 */
export interface HandoffResponse {
  /** Whether the task completed successfully. */
  success: boolean;
  /** The task result (text output, structured data, etc.). */
  result: Record<string, unknown> | null;
  /** Which device executed the task. */
  executedOn: string;
  /** Model used for inference (if applicable). */
  model: string;
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** Error message if the task failed. */
  error?: string;
}

/**
 * Capability summary for a paired device.
 * Discovered during the health check / pairing handshake.
 */
export interface DeviceCapability {
  /** Unique device identifier. */
  deviceId: string;
  /** Device platform. */
  platform: 'desktop' | 'mobile';
  /** Models available on the device. */
  models: string[];
  /** Available RAM in MB. */
  ramMb: number;
  /** Whether a GPU is available for inference. */
  gpuAvailable: boolean;
  /** Last time this device was seen (ISO 8601). */
  lastSeenAt: string;
  /** Whether the device is currently reachable. */
  online: boolean;
}

/**
 * Callback for handling incoming task offload requests.
 * The receiving device executes the task and returns a HandoffResponse.
 */
export type IncomingTaskHandler = (request: HandoffRequest) => Promise<HandoffResponse>;

// ─── Protocol ───────────────────────────────────────────────────────────────

/**
 * HandoffProtocol manages task offloading between paired Semblance devices.
 *
 * Usage:
 *   const protocol = new HandoffProtocol({ deviceId: 'my-device', platform: 'mobile' });
 *   protocol.setTransport(tunnelTransport);
 *   protocol.setIncomingTaskHandler(async (req) => { ... });
 *
 *   // Offload a task
 *   const response = await protocol.offloadTask({ taskType: 'reason', ... });
 *
 *   // Discover peers
 *   const peers = protocol.getKnownPeers();
 */
export class HandoffProtocol {
  private transport: HandoffTransport | null = null;
  private localDeviceId: string;
  private localPlatform: 'desktop' | 'mobile';
  private incomingHandler: IncomingTaskHandler | null = null;
  private knownPeers: Map<string, DeviceCapability> = new Map();

  constructor(config: {
    deviceId: string;
    platform: 'desktop' | 'mobile';
  }) {
    this.localDeviceId = config.deviceId;
    this.localPlatform = config.platform;
  }

  /**
   * Set the transport for device communication.
   * Called when a tunnel becomes available or changes.
   */
  setTransport(transport: HandoffTransport | null): void {
    this.transport = transport;

    // If transport is available, update peer info
    if (transport?.isReady()) {
      const remoteId = transport.getRemoteDeviceId();
      if (remoteId) {
        this.updatePeerStatus(remoteId, true);
      }
    }
  }

  /**
   * Register a handler for incoming task offload requests.
   * The handler executes the task locally and returns the result.
   */
  setIncomingTaskHandler(handler: IncomingTaskHandler): void {
    this.incomingHandler = handler;
  }

  /**
   * Discover available peer devices.
   * Queries the transport for currently reachable peers.
   */
  discoverPeers(): DeviceCapability[] {
    // Mark peers as offline if transport is down
    if (!this.transport?.isReady()) {
      for (const peer of this.knownPeers.values()) {
        peer.online = false;
      }
      return Array.from(this.knownPeers.values());
    }

    // If transport is ready, the connected peer is online
    const remoteId = this.transport.getRemoteDeviceId();
    if (remoteId) {
      this.updatePeerStatus(remoteId, true);
    }

    return Array.from(this.knownPeers.values());
  }

  /**
   * Get all known peers (online and offline).
   */
  getKnownPeers(): DeviceCapability[] {
    return Array.from(this.knownPeers.values());
  }

  /**
   * Offload a task to a paired device.
   * Returns null if no transport is available or the offload fails.
   */
  async offloadTask(request: Omit<HandoffRequest, 'sourcePlatform' | 'sourceDeviceId'>): Promise<HandoffResponse | null> {
    if (!this.transport?.isReady()) {
      return null;
    }

    const fullRequest: HandoffRequest = {
      ...request,
      sourcePlatform: this.localPlatform,
      sourceDeviceId: this.localDeviceId,
    };

    try {
      const actionRequest = {
        id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        action: 'inference.offload',
        payload: fullRequest,
        source: 'core' as const,
        signature: '', // Signed by the IPC layer
      };

      const startMs = Date.now();
      const result = await this.transport.send(actionRequest) as {
        data?: {
          text?: string;
          model?: string;
          tokensUsed?: number;
          error?: string;
        };
        status?: string;
      };

      const durationMs = Date.now() - startMs;

      if (result.status === 'error' || result.data?.error) {
        return {
          success: false,
          result: null,
          executedOn: this.transport.getRemoteDeviceId() ?? 'remote',
          model: result.data?.model ?? 'unknown',
          durationMs,
          error: result.data?.error ?? 'Remote execution failed',
        };
      }

      return {
        success: true,
        result: result.data as Record<string, unknown> ?? null,
        executedOn: this.transport.getRemoteDeviceId() ?? 'remote',
        model: result.data?.model ?? 'unknown',
        durationMs,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        executedOn: 'failed',
        model: 'none',
        durationMs: 0,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle an incoming task offload request from a remote device.
   * Delegates to the registered incoming task handler.
   */
  async handleIncomingTask(request: HandoffRequest): Promise<HandoffResponse> {
    if (!this.incomingHandler) {
      return {
        success: false,
        result: null,
        executedOn: this.localDeviceId,
        model: 'none',
        durationMs: 0,
        error: 'No incoming task handler registered',
      };
    }

    const startMs = Date.now();
    try {
      const response = await this.incomingHandler(request);
      return {
        ...response,
        executedOn: this.localDeviceId,
        durationMs: Date.now() - startMs,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        executedOn: this.localDeviceId,
        model: 'none',
        durationMs: Date.now() - startMs,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check if a paired device is available for offloading.
   */
  isPeerAvailable(): boolean {
    return this.transport?.isReady() ?? false;
  }

  /**
   * Get the local device ID.
   */
  getLocalDeviceId(): string {
    return this.localDeviceId;
  }

  /**
   * Register or update a known peer's capabilities.
   */
  registerPeer(capability: DeviceCapability): void {
    this.knownPeers.set(capability.deviceId, capability);
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private updatePeerStatus(deviceId: string, online: boolean): void {
    const existing = this.knownPeers.get(deviceId);
    if (existing) {
      existing.online = online;
      existing.lastSeenAt = new Date().toISOString();
    } else {
      // Create a minimal peer entry — will be enriched during pairing
      this.knownPeers.set(deviceId, {
        deviceId,
        platform: 'desktop', // Default assumption: mobile offloads to desktop
        models: [],
        ramMb: 0,
        gpuAvailable: false,
        lastSeenAt: new Date().toISOString(),
        online,
      });
    }
  }
}
