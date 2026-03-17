// TunnelTransport — IPCTransport over WireGuard mesh for remote device communication.
//
// Mobile Gateway sends ActionRequests over HTTP through the WireGuard tunnel to
// Desktop Gateway's TunnelGatewayServer, which runs validateAndExecute() and
// streams the response back. WireGuard handles all encryption at the network layer.
// The application layer is plain HTTP over the tunnel.
//
// CRITICAL: This file is in packages/core/. No platform-specific imports.

import type { ActionRequest, ActionResponse } from '../types/ipc.js';
import type { IPCTransport } from './transport.js';

export interface TunnelTransportConfig {
  /** IP address of the remote device on the WireGuard mesh (assigned by Headscale) */
  remoteHost: string;
  /** Port the remote TunnelGatewayServer listens on. Default: 51821 */
  remotePort?: number;
  /** Timeout for inference offload requests (ms). Default: 30000 */
  inferenceTimeoutMs?: number;
  /** Timeout for sync and lightweight requests (ms). Default: 10000 */
  defaultTimeoutMs?: number;
  /** Max retry attempts with exponential backoff. Default: 3 */
  maxRetries?: number;
  /** HTTP fetch function (injected, uses Gateway's audited fetch or globalThis.fetch) */
  fetchFn?: (url: string, options?: RequestInit) => Promise<Response>;
}

/**
 * Error thrown when tunnel communication fails.
 */
export class TunnelTransportError extends Error {
  constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'UNREACHABLE' | 'REJECTED' | 'TUNNEL_DOWN',
  ) {
    super(message);
    this.name = 'TunnelTransportError';
  }
}

/**
 * TunnelTransport implements IPCTransport for remote device communication
 * over a WireGuard-encrypted tunnel. Plain HTTP — WireGuard encrypts at network layer.
 */
export class TunnelTransport implements IPCTransport {
  private config: Required<Omit<TunnelTransportConfig, 'fetchFn'>> & { fetchFn: (url: string, options?: RequestInit) => Promise<Response> };
  private ready = false;
  private lastHeartbeatAt: number = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private remoteDeviceId: string | null = null;

  constructor(config: TunnelTransportConfig) {
    this.config = {
      remoteHost: config.remoteHost,
      remotePort: config.remotePort ?? 51821,
      inferenceTimeoutMs: config.inferenceTimeoutMs ?? 30000,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      fetchFn: config.fetchFn ?? globalThis.fetch.bind(globalThis),
    };
  }

  /**
   * Send an ActionRequest to the remote device via the tunnel.
   * Retries with exponential backoff on network errors.
   */
  async send(request: ActionRequest): Promise<ActionResponse> {
    const isInferenceOffload = (request.action as string) === 'inference.offload';
    const timeoutMs = isInferenceOffload
      ? this.config.inferenceTimeoutMs
      : this.config.defaultTimeoutMs;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.sendOnce(request, timeoutMs);
        return response;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on 4xx (client errors) — only network errors
        if (lastError instanceof TunnelTransportError && lastError.code === 'REJECTED') {
          throw lastError;
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new TunnelTransportError(
      'All retry attempts exhausted',
      'UNREACHABLE',
    );
  }

  /**
   * Start the transport — begins the heartbeat loop.
   */
  async start(): Promise<void> {
    // Initial health check
    await this.checkHealth();

    // Start heartbeat every 15 seconds
    this.heartbeatTimer = setInterval(() => {
      void this.checkHealth();
    }, 15_000);
  }

  /**
   * Stop the transport — stops the heartbeat loop.
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.ready = false;
  }

  /**
   * Check if the transport is ready (last heartbeat within 30 seconds).
   */
  isReady(): boolean {
    if (!this.ready) return false;
    const elapsed = Date.now() - this.lastHeartbeatAt;
    return elapsed < 30_000;
  }

  /**
   * Get the remote device ID (discovered during health check).
   */
  getRemoteDeviceId(): string | null {
    return this.remoteDeviceId;
  }

  /**
   * Get the base URL for the remote tunnel gateway.
   */
  getBaseUrl(): string {
    return `http://${this.config.remoteHost}:${this.config.remotePort}`;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async sendOnce(request: ActionRequest, timeoutMs: number): Promise<ActionResponse> {
    const url = `${this.getBaseUrl()}/action`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.config.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          const text = await response.text();
          throw new TunnelTransportError(
            `Remote rejected request: ${response.status} ${text}`,
            'REJECTED',
          );
        }
        throw new TunnelTransportError(
          `Remote server error: ${response.status}`,
          'UNREACHABLE',
        );
      }

      const data = await response.json();
      return data as ActionResponse;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof TunnelTransportError) throw error;

      const msg = (error as Error).message ?? '';
      if (msg.includes('abort') || msg.includes('timeout')) {
        throw new TunnelTransportError(
          `Request timed out after ${timeoutMs}ms`,
          'TIMEOUT',
        );
      }

      throw new TunnelTransportError(
        `Cannot reach remote device: ${msg}`,
        'TUNNEL_DOWN',
      );
    }
  }

  private async checkHealth(): Promise<void> {
    const url = `${this.getBaseUrl()}/health`;
    try {
      const response = await this.config.fetchFn(url, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as { ok: boolean; deviceId?: string };
        if (data.ok) {
          this.ready = true;
          this.lastHeartbeatAt = Date.now();
          this.remoteDeviceId = data.deviceId ?? null;
          return;
        }
      }
    } catch {
      // Health check failed
    }
    this.ready = false;
  }
}
