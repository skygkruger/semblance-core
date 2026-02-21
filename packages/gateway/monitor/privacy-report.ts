// Privacy Report Generator
// Produces a human-readable summary of network activity over a user-selected period.
// Sprint 2 scope: structured export with summary — not yet cryptographically signed.
// Cryptographic signing is Sprint 4 (requires full Privacy Dashboard infrastructure).

import type Database from 'better-sqlite3';
import { sha256 } from '@semblance/core';
import { AuditQuery } from '../audit/audit-query.js';
import type { Allowlist } from '../security/allowlist.js';

export interface PrivacyReport {
  metadata: {
    generatedAt: string;
    period: { start: string; end: string };
    appVersion: string;
    deviceId: string;
  };
  summary: {
    totalConnections: number;
    authorizedServices: string[];
    unauthorizedAttempts: number;
    totalTimeSavedSeconds: number;
  };
  services: Array<{
    name: string;
    domain: string;
    connectionCount: number;
    firstConnection: string | null;
    lastConnection: string | null;
  }>;
  auditTrailHash: string;
  statement: string;
}

export interface PrivacyReportConfig {
  auditDb: Database.Database;
  allowlist: Allowlist;
  appVersion?: string;
  deviceId?: string;
}

export class PrivacyReportGenerator {
  private query: AuditQuery;
  private allowlist: Allowlist;
  private appVersion: string;
  private deviceId: string;

  constructor(config: PrivacyReportConfig) {
    this.query = new AuditQuery(config.auditDb);
    this.allowlist = config.allowlist;
    this.appVersion = config.appVersion ?? '0.2.0';
    this.deviceId = config.deviceId ?? 'local-device';
  }

  /**
   * Generate a privacy report for a time period.
   */
  generate(options: {
    startDate: string;
    endDate: string;
    format: 'json' | 'text';
  }): PrivacyReport {
    const { startDate, endDate } = options;

    // Query all entries in the period
    const entries = this.query.getEntries({
      after: startDate,
      before: endDate,
      direction: 'response',
    });

    // Count unauthorized attempts
    const unauthorizedAttempts = this.query.count({
      after: startDate,
      before: endDate,
      status: 'rejected',
    });

    // Build per-service stats from entries
    const serviceMap = new Map<string, {
      connectionCount: number;
      firstConnection: string | null;
      lastConnection: string | null;
    }>();

    for (const entry of entries) {
      const service = actionToServiceKey(entry.action);
      const existing = serviceMap.get(service);
      if (existing) {
        existing.connectionCount++;
        if (!existing.firstConnection || entry.timestamp < existing.firstConnection) {
          existing.firstConnection = entry.timestamp;
        }
        if (!existing.lastConnection || entry.timestamp > existing.lastConnection) {
          existing.lastConnection = entry.timestamp;
        }
      } else {
        serviceMap.set(service, {
          connectionCount: 1,
          firstConnection: entry.timestamp,
          lastConnection: entry.timestamp,
        });
      }
    }

    // Enrich with allowlist domains
    const allowlistServices = this.allowlist.listServices();
    const services: PrivacyReport['services'] = [];

    for (const [serviceKey, stats] of serviceMap) {
      const matchingAllowlist = allowlistServices.find(s =>
        domainMatchesService(s.domain, serviceKey)
      );
      services.push({
        name: matchingAllowlist?.serviceName ?? serviceKey,
        domain: matchingAllowlist?.domain ?? serviceKey,
        connectionCount: stats.connectionCount,
        firstConnection: stats.firstConnection,
        lastConnection: stats.lastConnection,
      });
    }

    // Compute audit trail hash for tamper evidence
    const auditTrailHash = computeAuditHash(entries.map(e => e.id + e.payloadHash));

    // Total time saved
    const totalTimeSavedSeconds = entries.reduce(
      (sum, e) => sum + (e.estimatedTimeSavedSeconds ?? 0), 0
    );

    // Build the privacy statement
    const statement = unauthorizedAttempts === 0
      ? `During the period ${startDate} to ${endDate}, all network activity was limited to user-authorized services. No data was transmitted to unauthorized destinations. ${entries.length} connection(s) were made to ${services.length} authorized service(s).`
      : `During the period ${startDate} to ${endDate}, ${unauthorizedAttempts} unauthorized connection attempt(s) were detected and blocked. ${entries.length} authorized connection(s) were made to ${services.length} service(s).`;

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        period: { start: startDate, end: endDate },
        appVersion: this.appVersion,
        deviceId: this.deviceId,
      },
      summary: {
        totalConnections: entries.length,
        authorizedServices: services.map(s => s.name),
        unauthorizedAttempts,
        totalTimeSavedSeconds,
      },
      services,
      auditTrailHash,
      statement,
    };
  }

  /**
   * Format a report as human-readable text.
   */
  formatAsText(report: PrivacyReport): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║              SEMBLANCE PRIVACY REPORT                       ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Generated: ${report.metadata.generatedAt}`);
    lines.push(`Period: ${report.metadata.period.start} to ${report.metadata.period.end}`);
    lines.push(`App Version: ${report.metadata.appVersion}`);
    lines.push('');
    lines.push('── Summary ─────────────────────────────────────────────────────');
    lines.push(`Total Connections: ${report.summary.totalConnections}`);
    lines.push(`Authorized Services: ${report.summary.authorizedServices.join(', ') || 'None'}`);
    lines.push(`Unauthorized Attempts: ${report.summary.unauthorizedAttempts}`);
    lines.push(`Total Time Saved: ${formatTimeSaved(report.summary.totalTimeSavedSeconds)}`);
    lines.push('');
    lines.push('── Services ────────────────────────────────────────────────────');

    for (const svc of report.services) {
      lines.push(`  ${svc.name} (${svc.domain})`);
      lines.push(`    Connections: ${svc.connectionCount}`);
      if (svc.firstConnection) lines.push(`    First: ${svc.firstConnection}`);
      if (svc.lastConnection) lines.push(`    Last: ${svc.lastConnection}`);
    }

    if (report.services.length === 0) {
      lines.push('  No services contacted during this period.');
    }

    lines.push('');
    lines.push('── Statement ───────────────────────────────────────────────────');
    lines.push(report.statement);
    lines.push('');
    lines.push(`Audit Trail Hash: ${report.auditTrailHash}`);
    lines.push('');
    lines.push('── End of Report ───────────────────────────────────────────────');

    return lines.join('\n');
  }
}

function actionToServiceKey(action: string): string {
  const dot = action.indexOf('.');
  return dot > 0 ? action.substring(0, dot) : action;
}

function domainMatchesService(domain: string, serviceKey: string): boolean {
  const lower = domain.toLowerCase();
  if (serviceKey === 'email') return lower.includes('imap') || lower.includes('smtp') || lower.includes('mail');
  if (serviceKey === 'calendar') return lower.includes('caldav') || lower.includes('calendar');
  if (serviceKey === 'finance') return lower.includes('plaid') || lower.includes('bank');
  if (serviceKey === 'health') return lower.includes('health');
  return false;
}

function computeAuditHash(entries: string[]): string {
  if (entries.length === 0) return sha256('empty-audit-period');
  return sha256(entries.join('|'));
}

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hours`;
}
