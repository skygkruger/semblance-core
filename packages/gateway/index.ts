// @semblance/gateway — Semblance Gateway entry point
// This is the SOLE process with network entitlement.
// Accepts typed action requests from AI Core via IPC only.
// Wires together: IPC transport, validation pipeline, audit trail,
// allowlist, rate limiter, anomaly detector, service registry.

import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

import { AuditTrail } from './audit/trail.js';
import { Allowlist } from './security/allowlist.js';
import { KeyManager } from './security/signing.js';
import { RateLimiter } from './security/rate-limiter.js';
import { AnomalyDetector } from './security/anomaly-detector.js';
import { ServiceRegistry } from './services/registry.js';
import { GatewayTransport } from './ipc/transport.js';
import { validateAndExecute } from './ipc/validator.js';

export interface GatewayConfig {
  /** Directory for Gateway databases. Defaults to ~/.semblance/gateway/ */
  dataDir?: string;
  /** Custom socket path for IPC. */
  socketPath?: string;
  /** Path to write the shared signing key file. Defaults to ~/.semblance/signing.key */
  signingKeyPath?: string;
  /** Rate limiter configuration overrides. */
  rateLimiter?: ConstructorParameters<typeof RateLimiter>[0];
  /** Anomaly detector configuration overrides. */
  anomalyDetector?: ConstructorParameters<typeof AnomalyDetector>[0];
}

export class Gateway {
  private transport: GatewayTransport | null = null;
  private auditDb: Database.Database | null = null;
  private configDb: Database.Database | null = null;
  private auditTrail: AuditTrail | null = null;
  private allowlist: Allowlist | null = null;
  private rateLimiter: RateLimiter | null = null;
  private anomalyDetector: AnomalyDetector | null = null;
  private serviceRegistry: ServiceRegistry | null = null;
  private config: GatewayConfig;

  constructor(config?: GatewayConfig) {
    this.config = config ?? {};
  }

  /**
   * Start the Gateway. Initializes databases, loads keys,
   * starts the IPC listener, and wires the validation pipeline.
   */
  async start(): Promise<void> {
    const dataDir = this.config.dataDir ?? join(homedir(), '.semblance', 'gateway');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Initialize SQLite databases
    this.auditDb = new Database(join(dataDir, 'audit.db'));
    this.configDb = new Database(join(dataDir, 'config.db'));

    // Initialize components
    this.auditTrail = new AuditTrail(this.auditDb);
    this.allowlist = new Allowlist(this.configDb);
    const keyManager = new KeyManager(this.configDb);
    const signingKey = keyManager.getKey();

    // Write the signing key to a shared file so the Core process can read it
    const signingKeyPath = this.config.signingKeyPath ?? join(homedir(), '.semblance', 'signing.key');
    const signingKeyDir = dirname(signingKeyPath);
    if (!existsSync(signingKeyDir)) {
      mkdirSync(signingKeyDir, { recursive: true });
    }
    keyManager.writeKeyFile(signingKeyPath);

    this.rateLimiter = new RateLimiter(this.config.rateLimiter);
    this.anomalyDetector = new AnomalyDetector(this.config.anomalyDetector);
    this.serviceRegistry = new ServiceRegistry();

    // Pre-seed the anomaly detector with existing allowlisted domains
    for (const service of this.allowlist.listServices()) {
      if (service.isActive) {
        this.anomalyDetector.markDomainSeen(service.domain);
      }
    }

    // Wire the IPC transport to the validation pipeline
    this.transport = new GatewayTransport({
      socketPath: this.config.socketPath,
      onMessage: async (data: unknown) => {
        return validateAndExecute(data, {
          signingKey,
          auditTrail: this.auditTrail!,
          allowlist: this.allowlist!,
          rateLimiter: this.rateLimiter!,
          anomalyDetector: this.anomalyDetector!,
          serviceRegistry: this.serviceRegistry!,
        });
      },
      onError: (error: Error) => {
        console.error('[Gateway] IPC error:', error.message);
      },
      onConnection: () => {
        console.log('[Gateway] Core connected via IPC');
      },
      onDisconnection: () => {
        console.log('[Gateway] Core disconnected');
      },
    });

    await this.transport.start();

    // Log startup to audit trail
    this.auditTrail.append({
      requestId: 'gateway-startup',
      timestamp: new Date().toISOString(),
      action: 'service.api_call',
      direction: 'response',
      status: 'success',
      payloadHash: 'startup',
      signature: 'startup',
      metadata: { event: 'gateway_started' },
    });

    console.log('[Gateway] Started and listening for IPC connections');
  }

  /**
   * Stop the Gateway gracefully. Closes IPC, closes databases.
   */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.stop();
      this.transport = null;
    }

    if (this.auditDb) {
      this.auditDb.close();
      this.auditDb = null;
    }

    if (this.configDb) {
      this.configDb.close();
      this.configDb = null;
    }

    console.log('[Gateway] Stopped');
  }

  /**
   * Get the audit trail for querying.
   */
  getAuditTrail(): AuditTrail {
    if (!this.auditTrail) throw new Error('Gateway not started');
    return this.auditTrail;
  }

  /**
   * Get the allowlist for management.
   */
  getAllowlist(): Allowlist {
    if (!this.allowlist) throw new Error('Gateway not started');
    return this.allowlist;
  }

  /**
   * Get the rate limiter for monitoring.
   */
  getRateLimiter(): RateLimiter {
    if (!this.rateLimiter) throw new Error('Gateway not started');
    return this.rateLimiter;
  }

  /**
   * Get the service registry for adapter management.
   */
  getServiceRegistry(): ServiceRegistry {
    if (!this.serviceRegistry) throw new Error('Gateway not started');
    return this.serviceRegistry;
  }

  /**
   * Check if the Core is connected via IPC.
   */
  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }
}

// Re-export key types and classes for consumers
export { AuditTrail } from './audit/trail.js';
export { TIME_SAVED_DEFAULTS, TIME_SAVED_GRANULAR, getDefaultTimeSaved } from './audit/time-saved-defaults.js';
export { Allowlist } from './security/allowlist.js';
export { KeyManager } from './security/signing.js';
export { RateLimiter } from './security/rate-limiter.js';
export { AnomalyDetector } from './security/anomaly-detector.js';
export { ServiceRegistry } from './services/registry.js';
export { GatewayTransport } from './ipc/transport.js';
export { validateAndExecute } from './ipc/validator.js';
export { CredentialStore } from './credentials/store.js';
export { PROVIDER_PRESETS } from './credentials/types.js';
export { EmailAdapter, IMAPAdapter, SMTPAdapter } from './services/email/index.js';
export { CalendarAdapter, CalDAVAdapter } from './services/calendar/index.js';
export type { ServiceAdapter } from './services/types.js';
export type { TransportConfig } from './ipc/transport.js';
export type { ValidatorDeps } from './ipc/validator.js';
export type { ServiceCredential, ServiceCredentialInput, ConnectionTestResult, ProviderPreset } from './credentials/types.js';
export type { EmailMessage, EmailAddress, EmailFetchParams, EmailSendParams } from './services/email/types.js';
export type { CalendarEvent, CalendarInfo, CalendarFetchParams, CalendarCreateParams, CalendarUpdateParams } from './services/calendar/types.js';
