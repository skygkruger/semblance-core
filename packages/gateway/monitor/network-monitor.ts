// Network Monitor Service
// Provides real-time connection tracking and statistics by querying
// the Gateway's existing audit trail. Does NOT perform network
// operations — reads structured log data only.

import type Database from 'better-sqlite3';
import { AuditQuery } from '../audit/audit-query.js';
import type { ServiceAggregate, TimelinePoint } from '../audit/audit-query.js';
import type { Allowlist, AllowedService } from '../security/allowlist.js';

// --- Public Interfaces ---

export interface ActiveConnection {
  id: string;
  service: string;
  protocol: string;
  connectedSince: string;
  status: 'active' | 'idle' | 'reconnecting';
  lastActivity: string;
}

export interface ConnectionRecord {
  id: string;
  timestamp: string;
  service: string;
  action: string;
  direction: 'outbound';
  status: 'success' | 'error' | 'timeout';
  requestId: string;
  durationMs: number;
}

export interface NetworkStatistics {
  period: string;
  totalConnections: number;
  connectionsByService: Record<string, number>;
  connectionsByAction: Record<string, number>;
  unauthorizedAttempts: number;
  uniqueServicesContacted: number;
  averageTimeSavedSeconds: number;
  totalTimeSavedSeconds: number;
}

export interface AllowlistEntry {
  service: string;
  domain: string;
  protocol: string;
  addedAt: string;
  addedBy: string;
  connectionCount: number;
  lastUsed: string | null;
  isActive: boolean;
}

export interface UnauthorizedAttempt {
  timestamp: string;
  requestedAction: string;
  reason: string;
  blocked: true;
}

export interface HistoryOptions {
  after?: string;
  before?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

// --- Service to Protocol mapping ---

const SERVICE_PROTOCOL_MAP: Record<string, string> = {
  'email.fetch': 'IMAP',
  'email.send': 'SMTP',
  'email.draft': 'SMTP',
  'email.archive': 'IMAP',
  'email.move': 'IMAP',
  'email.markRead': 'IMAP',
  'calendar.fetch': 'CalDAV',
  'calendar.create': 'CalDAV',
  'calendar.update': 'CalDAV',
  'calendar.delete': 'CalDAV',
  'finance.fetch_transactions': 'HTTPS',
  'health.fetch': 'HTTPS',
  'service.api_call': 'HTTPS',
};

function getProtocol(action: string): string {
  return SERVICE_PROTOCOL_MAP[action] ?? 'HTTPS';
}

function actionToServiceName(action: string): string {
  const prefix = action.indexOf('.') > 0 ? action.substring(0, action.indexOf('.')) : action;
  const nameMap: Record<string, string> = {
    email: 'Email',
    calendar: 'Calendar',
    finance: 'Finance',
    health: 'Health',
    service: 'API',
  };
  return nameMap[prefix] ?? prefix;
}

// --- Network Monitor ---

export interface NetworkMonitorConfig {
  auditDb: Database.Database;
  allowlist: Allowlist;
}

export class NetworkMonitor {
  private query: AuditQuery;
  private allowlist: Allowlist;
  private activeConnections = new Map<string, ActiveConnection>();

  constructor(config: NetworkMonitorConfig) {
    this.query = new AuditQuery(config.auditDb);
    this.allowlist = config.allowlist;
  }

  /**
   * Get currently tracked active connections.
   * In practice, connections are transient (IMAP fetches, SMTP sends).
   * This tracks which services have been active recently.
   */
  getActiveConnections(): ActiveConnection[] {
    return Array.from(this.activeConnections.values());
  }

  /**
   * Register or update an active connection (called by adapters/bridge).
   */
  trackConnection(id: string, connection: Omit<ActiveConnection, 'id'>): void {
    this.activeConnections.set(id, { id, ...connection });
  }

  /**
   * Remove a tracked connection.
   */
  removeConnection(id: string): void {
    this.activeConnections.delete(id);
  }

  /**
   * Get connection history from the audit trail.
   */
  getConnectionHistory(options: HistoryOptions = {}): ConnectionRecord[] {
    const entries = this.query.getEntries({
      after: options.after,
      before: options.before,
      action: options.action,
      direction: 'response',
      limit: options.limit ?? 50,
      offset: options.offset,
    });

    return entries.map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      service: actionToServiceName(entry.action),
      action: entry.action,
      direction: 'outbound' as const,
      status: entry.status === 'success' ? 'success' as const
        : entry.status === 'error' ? 'error' as const
        : 'error' as const,
      requestId: entry.requestId,
      durationMs: 0,
    }));
  }

  /**
   * Get aggregate statistics for a period.
   */
  getStatistics(period: 'today' | 'week' | 'month' | 'all'): NetworkStatistics {
    const aggregates = this.query.aggregateByService(period);
    const totalConnections = aggregates.reduce((sum, a) => sum + a.connectionCount, 0);
    const totalTimeSaved = aggregates.reduce((sum, a) => sum + a.totalTimeSavedSeconds, 0);

    const connectionsByService: Record<string, number> = {};
    for (const agg of aggregates) {
      connectionsByService[agg.service] = agg.connectionCount;
    }

    // Get per-action counts
    const connectionsByAction: Record<string, number> = {};
    const entries = this.query.getEntries({
      after: periodToAfter(period),
      direction: 'response',
    });
    for (const entry of entries) {
      connectionsByAction[entry.action] = (connectionsByAction[entry.action] ?? 0) + 1;
    }

    // Count unauthorized (rejected) attempts
    const unauthorizedAttempts = this.query.count({
      after: periodToAfter(period),
      status: 'rejected',
    });

    return {
      period,
      totalConnections,
      connectionsByService,
      connectionsByAction,
      unauthorizedAttempts,
      uniqueServicesContacted: aggregates.length,
      averageTimeSavedSeconds: totalConnections > 0 ? Math.round(totalTimeSaved / totalConnections) : 0,
      totalTimeSavedSeconds: totalTimeSaved,
    };
  }

  /**
   * Get the allowlist enriched with usage data from the audit trail.
   */
  getEnrichedAllowlist(): AllowlistEntry[] {
    const services = this.allowlist.listServices();
    const allAggregates = this.query.aggregateByService('all');

    return services.map(svc => {
      const servicePrefix = this.domainToServicePrefix(svc.domain);
      const aggregate = allAggregates.find(a => a.service === servicePrefix);

      return {
        service: svc.serviceName,
        domain: svc.domain,
        protocol: svc.protocol,
        addedAt: svc.addedAt,
        addedBy: svc.addedBy,
        connectionCount: aggregate?.connectionCount ?? 0,
        lastUsed: aggregate?.lastActivity ?? null,
        isActive: svc.isActive,
      };
    });
  }

  /**
   * Get unauthorized (rejected) connection attempts.
   * Should always return an empty array in a healthy system.
   */
  getUnauthorizedAttempts(period?: string): UnauthorizedAttempt[] {
    const after = period ? periodToAfter(period as 'today' | 'week' | 'month' | 'all') : undefined;
    const entries = this.query.getEntries({
      after: after ?? undefined,
      status: 'rejected',
      limit: 100,
    });

    return entries.map(entry => ({
      timestamp: entry.timestamp,
      requestedAction: entry.action,
      reason: (entry.metadata as Record<string, unknown> | undefined)?.rejectionReason as string
        ?? 'domain_not_on_allowlist',
      blocked: true as const,
    }));
  }

  /**
   * Get timeline data for activity charts.
   */
  getTimeline(options: { period: 'today' | 'week' | 'month'; granularity: 'hour' | 'day' }): TimelinePoint[] {
    return this.query.getTimeline(options);
  }

  /**
   * Get a quick trust status summary.
   */
  getTrustStatus(): { clean: boolean; unauthorizedCount: number; activeServiceCount: number } {
    const unauthorizedCount = this.query.count({ status: 'rejected' });
    const activeServices = this.allowlist.listServices().filter(s => s.isActive);
    return {
      clean: unauthorizedCount === 0,
      unauthorizedCount,
      activeServiceCount: activeServices.length,
    };
  }

  /**
   * Map a domain to a service prefix for matching with audit trail data.
   */
  private domainToServicePrefix(domain: string): string {
    const lower = domain.toLowerCase();
    if (lower.includes('imap') || lower.includes('smtp') || lower.includes('mail')) return 'email';
    if (lower.includes('caldav') || lower.includes('calendar')) return 'calendar';
    if (lower.includes('plaid') || lower.includes('finance') || lower.includes('bank')) return 'finance';
    if (lower.includes('health')) return 'health';
    return 'service';
  }
}

function periodToAfter(period: string | undefined): string | undefined {
  if (!period) return undefined;
  const now = new Date();
  switch (period) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start.toISOString();
    }
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    case 'all':
      return undefined;
    default:
      return undefined;
  }
}
