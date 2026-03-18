// TunnelGatewayServer — HTTP server on the WireGuard mesh interface.
//
// Receives ActionRequests from remote devices, validates them through the
// existing validateAndExecute() pipeline, and returns ActionResponses.
// Binds ONLY to the WireGuard mesh IP — not to 0.0.0.0.
// Only devices on the WireGuard mesh can reach this server.

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { sha256 } from '@semblance/core';
import type { AuditTrail } from '../audit/trail.js';

export interface PeerCapabilityManifest {
  deviceId: string;
  displayName: string;
  platform: 'macos' | 'windows' | 'linux' | 'ios' | 'android';
  semblanceVersion: string;
  modelTier: 'constrained' | 'standard' | 'performance' | 'workstation';
  activeModelId: string | null;
  knowledgeGraphStats: {
    emailCount: number;
    documentCount: number;
    calendarEventCount: number;
    contactCount: number;
    totalNodes: number;
  };
  enabledFeatures: string[];
  availableDiskGb: number;
  availableRamMb: number;
  lastUpdatedAt: string;
}

export interface TunnelGatewayServerConfig {
  /** Port to listen on. Default: 51821 */
  port?: number;
  /** WireGuard interface address. Binds to this IP only. */
  bindAddress: string;
  /** The Gateway's validateAndExecute function */
  validateAndExecute: (request: unknown) => Promise<unknown>;
  /** Audit trail for logging tunnel-received requests */
  auditTrail?: AuditTrail;
  /** Device identifier for /health and /info responses */
  deviceId?: string;
  /** Platform name for /info responses */
  platform?: string;
}

/**
 * TunnelGatewayServer accepts ActionRequests from remote devices on the mesh.
 */
export class TunnelGatewayServer {
  private server: Server | null = null;
  private config: TunnelGatewayServerConfig;
  private port: number;
  private connectedPeers: Set<string> = new Set();
  private running = false;

  constructor(config: TunnelGatewayServerConfig) {
    this.config = config;
    this.port = config.port ?? 51821;
  }

  /**
   * Start the server on the WireGuard mesh IP.
   */
  async start(): Promise<void> {
    if (this.server) return;

    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, this.config.bindAddress, () => {
        this.running = true;
        console.log(`[TunnelGateway] Listening on ${this.config.bindAddress}:${this.port}`);
        resolve();
      });
      this.server!.on('error', (err) => {
        console.error('[TunnelGateway] Server error:', err.message);
        reject(err);
      });
    });
  }

  /**
   * Stop the server gracefully.
   */
  async stop(): Promise<void> {
    if (!this.server) return;
    return new Promise<void>((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.running = false;
        this.connectedPeers.clear();
        console.log('[TunnelGateway] Stopped');
        resolve();
      });
    });
  }

  /**
   * Check if the server is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get server status.
   */
  getStatus(): { running: boolean; bindAddress: string; port: number; connectedPeers: number } {
    return {
      running: this.running,
      bindAddress: this.config.bindAddress,
      port: this.port,
      connectedPeers: this.connectedPeers.size,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const remoteIp = req.socket.remoteAddress ?? 'unknown';
    this.connectedPeers.add(remoteIp);

    // CORS headers for tunnel peers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? '/';

    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        deviceId: this.config.deviceId ?? 'unknown',
        platform: this.config.platform ?? process.platform,
      }));
      return;
    }

    if (req.method === 'GET' && url === '/info') {
      const manifest: PeerCapabilityManifest = {
        deviceId: this.config.deviceId ?? 'unknown',
        displayName: this.config.deviceId ?? 'Semblance Device',
        platform: (this.config.platform ?? process.platform) as PeerCapabilityManifest['platform'],
        semblanceVersion: '1.0.0',
        modelTier: 'standard',
        activeModelId: null,
        knowledgeGraphStats: {
          emailCount: 0,
          documentCount: 0,
          calendarEventCount: 0,
          contactCount: 0,
          totalNodes: 0,
        },
        enabledFeatures: ['inference', 'knowledge_graph', 'tools', 'audit', 'browser_cdp', 'channels'],
        availableDiskGb: 0,
        availableRamMb: 0,
        lastUpdatedAt: new Date().toISOString(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifest));
      return;
    }

    if (req.method === 'POST' && url === '/action') {
      await this.handleAction(req, res, remoteIp);
      return;
    }

    if (req.method === 'POST' && url === '/kg-sync') {
      await this.handleKGSync(req, res, remoteIp);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private async handleAction(req: IncomingMessage, res: ServerResponse, remoteIp: string): Promise<void> {
    const body = await this.readBody(req);
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    // Log to audit trail with tunnel source metadata
    if (this.config.auditTrail) {
      const payloadHash = sha256(JSON.stringify(body));
      this.config.auditTrail.append({
        requestId: `tunnel-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: ((body as Record<string, unknown>).action ?? 'unknown') as any,
        direction: 'request',
        status: 'pending',
        payloadHash,
        signature: payloadHash,
        metadata: { source: 'tunnel', remoteIp },
      });
    }

    try {
      // Run through the full validateAndExecute() pipeline
      const result = await this.config.validateAndExecute(body);

      // Check if this is an inference offload that should stream
      const action = (body as Record<string, unknown>).action;
      if (action === 'inference.offload') {
        // Stream NDJSON response for inference
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        });
        res.write(JSON.stringify(result) + '\n');
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: { code: 'TUNNEL_EXECUTION_ERROR', message: (error as Error).message },
      }));
    }
  }

  private async handleKGSync(req: IncomingMessage, res: ServerResponse, _remoteIp: string): Promise<void> {
    const body = await this.readBody(req);
    if (!body) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    // KG sync is handled by the caller wiring this endpoint
    // For now, return an empty delta response
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      remoteMerkleRoot: '',
      deltas: [],
    }));
  }

  private readBody(req: IncomingMessage): Promise<unknown | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }
}
