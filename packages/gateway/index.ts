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
import { ReminderAdapter } from './services/reminder-adapter.js';
import { WebSearchAdapterFactory } from './services/web-search-factory.js';
import { WebFetchAdapter } from './services/web-fetch-adapter.js';
import { ReminderStore } from '@semblance/core/knowledge/reminder-store.js';
import { OAuthTokenManager } from './services/oauth-token-manager.js';
import { GoogleDriveAdapter } from './services/google-drive-adapter.js';

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
  private reminderDb: Database.Database | null = null;
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

    // --- Step 10: Register web search, web fetch, and reminder adapters ---

    // Initialize web search settings table in configDb
    this.configDb.exec(`
      CREATE TABLE IF NOT EXISTS web_search_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Helper: read a web search setting
    const getWebSetting = (key: string): string | null => {
      const row = this.configDb!.prepare(
        'SELECT value FROM web_search_settings WHERE key = ?'
      ).get(key) as { value: string } | undefined;
      return row?.value ?? null;
    };

    // Web Search: factory selects Brave vs. SearXNG based on user config
    const searchFactory = new WebSearchAdapterFactory({
      getProvider: () => (getWebSetting('provider') as 'brave' | 'searxng') ?? 'brave',
      getBraveApiKey: () => getWebSetting('brave_api_key'),
      getSearXNGUrl: () => getWebSetting('searxng_url'),
    });
    // Register a delegating adapter that resolves the active search provider per-call
    const searchDelegator = {
      async execute(action: Parameters<import('./services/types.js').ServiceAdapter['execute']>[0], payload: Parameters<import('./services/types.js').ServiceAdapter['execute']>[1]) {
        return searchFactory.getAdapter().execute(action, payload);
      },
    };
    this.serviceRegistry.register('web.search', searchDelegator);

    // Web Fetch: content extraction adapter
    const webFetchAdapter = new WebFetchAdapter();
    this.serviceRegistry.register('web.fetch', webFetchAdapter);

    // Reminders: local-only CRUD via SQLite
    this.reminderDb = new Database(join(dataDir, 'reminders.db'));
    const reminderStore = new ReminderStore(this.reminderDb as unknown as import('@semblance/core/platform/types.js').DatabaseHandle);
    const reminderAdapter = new ReminderAdapter(reminderStore);
    this.serviceRegistry.register('reminder.create', reminderAdapter);
    this.serviceRegistry.register('reminder.update', reminderAdapter);
    this.serviceRegistry.register('reminder.list', reminderAdapter);
    this.serviceRegistry.register('reminder.delete', reminderAdapter);

    // --- Cloud Storage: Google Drive adapter (OAuth + read-only API v3) ---
    const oauthTokenManager = new OAuthTokenManager(this.configDb);
    const googleDriveAdapter = new GoogleDriveAdapter(oauthTokenManager, {
      clientId: process.env['SEMBLANCE_GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['SEMBLANCE_GOOGLE_CLIENT_SECRET'] ?? '',
    });
    this.serviceRegistry.register('cloud.auth', googleDriveAdapter);
    this.serviceRegistry.register('cloud.auth_status', googleDriveAdapter);
    this.serviceRegistry.register('cloud.disconnect', googleDriveAdapter);
    this.serviceRegistry.register('cloud.list_files', googleDriveAdapter);
    this.serviceRegistry.register('cloud.file_metadata', googleDriveAdapter);
    this.serviceRegistry.register('cloud.download_file', googleDriveAdapter);
    this.serviceRegistry.register('cloud.check_changed', googleDriveAdapter);

    // Auto-add Google Drive API domain to allowlist
    if (!this.allowlist.isAllowed('www.googleapis.com')) {
      this.allowlist.addService({
        serviceName: 'Google Drive API',
        domain: 'www.googleapis.com',
        protocol: 'https',
        addedBy: 'system',
      });
    }
    if (!this.allowlist.isAllowed('oauth2.googleapis.com')) {
      this.allowlist.addService({
        serviceName: 'Google OAuth2',
        domain: 'oauth2.googleapis.com',
        protocol: 'https',
        addedBy: 'system',
      });
    }
    if (!this.allowlist.isAllowed('accounts.google.com')) {
      this.allowlist.addService({
        serviceName: 'Google Accounts',
        domain: 'accounts.google.com',
        protocol: 'https',
        addedBy: 'system',
      });
    }

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

    if (this.reminderDb) {
      this.reminderDb.close();
      this.reminderDb = null;
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

  /**
   * Save web search settings and auto-add required domains to the allowlist.
   * Called by the desktop app when the user saves search configuration.
   */
  saveWebSearchSettings(settings: {
    provider?: 'brave' | 'searxng';
    braveApiKey?: string;
    searxngUrl?: string;
    rateLimit?: number;
  }): void {
    if (!this.configDb || !this.allowlist) throw new Error('Gateway not started');

    const upsert = this.configDb.prepare(
      'INSERT INTO web_search_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );

    if (settings.provider !== undefined) {
      upsert.run('provider', settings.provider);
    }
    if (settings.braveApiKey !== undefined) {
      upsert.run('brave_api_key', settings.braveApiKey);
      // Auto-add Brave Search domain to allowlist when API key is configured
      if (settings.braveApiKey && !this.allowlist.isAllowed('api.search.brave.com')) {
        this.allowlist.addService({
          serviceName: 'Brave Search API',
          domain: 'api.search.brave.com',
          protocol: 'https',
          addedBy: 'system',
        });
      }
    }
    if (settings.searxngUrl !== undefined) {
      upsert.run('searxng_url', settings.searxngUrl);
      // Auto-add SearXNG domain to allowlist when URL is configured
      if (settings.searxngUrl) {
        try {
          const searxngDomain = new URL(settings.searxngUrl).hostname;
          if (searxngDomain && !this.allowlist.isAllowed(searxngDomain)) {
            this.allowlist.addService({
              serviceName: 'SearXNG',
              domain: searxngDomain,
              protocol: 'https',
              addedBy: 'system',
            });
          }
        } catch {
          // Invalid URL — skip allowlist addition
        }
      }
    }
    if (settings.rateLimit !== undefined) {
      upsert.run('rate_limit', String(settings.rateLimit));
    }
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
export { ReminderAdapter } from './services/reminder-adapter.js';
export { WebSearchAdapter } from './services/web-search-adapter.js';
export { SearXNGAdapter } from './services/searxng-adapter.js';
export { WebSearchAdapterFactory } from './services/web-search-factory.js';
export { WebFetchAdapter } from './services/web-fetch-adapter.js';
export type { SearchProvider, WebSearchFactoryConfig } from './services/web-search-factory.js';
export type { ServiceAdapter } from './services/types.js';
export type { TransportConfig } from './ipc/transport.js';
export type { ValidatorDeps } from './ipc/validator.js';
export type { ServiceCredential, ServiceCredentialInput, ConnectionTestResult, ProviderPreset } from './credentials/types.js';
export type { EmailMessage, EmailAddress, EmailFetchParams, EmailSendParams } from './services/email/types.js';
export type { CalendarEvent, CalendarInfo, CalendarFetchParams, CalendarCreateParams, CalendarUpdateParams } from './services/calendar/types.js';
export { AuditQuery } from './audit/audit-query.js';
export type { QueryOptions, ServiceAggregate, TimelinePoint } from './audit/audit-query.js';
export { NetworkMonitor } from './monitor/network-monitor.js';
export { PrivacyReportGenerator } from './monitor/privacy-report.js';
export type {
  ActiveConnection, ConnectionRecord, NetworkStatistics,
  AllowlistEntry as MonitorAllowlistEntry, UnauthorizedAttempt,
  HistoryOptions, NetworkMonitorConfig,
} from './monitor/network-monitor.js';
export type { PrivacyReport, PrivacyReportConfig } from './monitor/privacy-report.js';
export { OAuthTokenManager } from './services/oauth-token-manager.js';
export type { OAuthTokens } from './services/oauth-token-manager.js';
export { OAuthCallbackServer } from './services/oauth-callback-server.js';
export type { CallbackServerResult, AuthCodeResult } from './services/oauth-callback-server.js';
export { GoogleDriveAdapter, GOOGLE_DRIVE_READONLY_SCOPE } from './services/google-drive-adapter.js';
export type { GoogleDriveConfig } from './services/google-drive-adapter.js';
