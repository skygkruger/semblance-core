// Tests for NetworkMonitor — active connections, history, statistics, allowlist, unauthorized attempts.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { NetworkMonitor } from '@semblance/gateway/monitor/network-monitor.js';
import type { ActionType } from '@semblance/core';

function seedAudit(trail: AuditTrail, entries: Array<{ action: ActionType; status?: string; minutesAgo?: number }>): void {
  for (const entry of entries) {
    trail.append({
      requestId: `req-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date(Date.now() - (entry.minutesAgo ?? 5) * 60000).toISOString(),
      action: entry.action,
      direction: 'response',
      status: (entry.status ?? 'success') as 'success' | 'error' | 'rejected',
      payloadHash: 'hash',
      signature: 'sig',
      estimatedTimeSavedSeconds: 30,
    });
  }
}

describe('NetworkMonitor', () => {
  let auditDb: Database.Database;
  let configDb: Database.Database;
  let trail: AuditTrail;
  let allowlist: Allowlist;
  let monitor: NetworkMonitor;

  beforeEach(() => {
    auditDb = new Database(':memory:');
    configDb = new Database(':memory:');
    trail = new AuditTrail(auditDb);
    allowlist = new Allowlist(configDb);
    monitor = new NetworkMonitor({ auditDb, allowlist });
  });

  describe('active connections', () => {
    it('starts with no active connections', () => {
      const connections = monitor.getActiveConnections();
      expect(connections).toEqual([]);
    });

    it('tracks registered connections', () => {
      monitor.trackConnection('conn-1', {
        service: 'Gmail (IMAP)',
        protocol: 'IMAP',
        connectedSince: new Date().toISOString(),
        status: 'active',
        lastActivity: new Date().toISOString(),
      });
      const connections = monitor.getActiveConnections();
      expect(connections.length).toBe(1);
      expect(connections[0]!.service).toBe('Gmail (IMAP)');
    });

    it('removes connections', () => {
      monitor.trackConnection('conn-1', {
        service: 'Gmail',
        protocol: 'IMAP',
        connectedSince: new Date().toISOString(),
        status: 'idle',
        lastActivity: new Date().toISOString(),
      });
      monitor.removeConnection('conn-1');
      expect(monitor.getActiveConnections()).toEqual([]);
    });
  });

  describe('connection history', () => {
    it('returns connection records from audit trail', () => {
      seedAudit(trail, [
        { action: 'email.fetch' },
        { action: 'email.send' },
        { action: 'calendar.fetch' },
      ]);
      const history = monitor.getConnectionHistory();
      expect(history.length).toBe(3);
      expect(history[0]!.direction).toBe('outbound');
    });

    it('respects limit parameter', () => {
      seedAudit(trail, [
        { action: 'email.fetch' },
        { action: 'email.fetch' },
        { action: 'email.fetch' },
      ]);
      const history = monitor.getConnectionHistory({ limit: 2 });
      expect(history.length).toBe(2);
    });

    it('maps action to service name', () => {
      seedAudit(trail, [{ action: 'email.fetch' }]);
      const history = monitor.getConnectionHistory();
      expect(history[0]!.service).toBe('Email');
      expect(history[0]!.action).toBe('email.fetch');
    });
  });

  describe('statistics', () => {
    it('returns zero statistics when empty', () => {
      const stats = monitor.getStatistics('all');
      expect(stats.totalConnections).toBe(0);
      expect(stats.unauthorizedAttempts).toBe(0);
      expect(stats.uniqueServicesContacted).toBe(0);
    });

    it('counts connections by service', () => {
      seedAudit(trail, [
        { action: 'email.fetch' },
        { action: 'email.send' },
        { action: 'calendar.fetch' },
      ]);
      const stats = monitor.getStatistics('all');
      expect(stats.totalConnections).toBe(3);
      expect(stats.connectionsByService['email']).toBe(2);
      expect(stats.connectionsByService['calendar']).toBe(1);
      expect(stats.uniqueServicesContacted).toBe(2);
    });

    it('counts unauthorized attempts', () => {
      trail.append({
        requestId: 'bad-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch',
        direction: 'response',
        status: 'rejected',
        payloadHash: 'h',
        signature: 's',
      });
      const stats = monitor.getStatistics('all');
      expect(stats.unauthorizedAttempts).toBe(1);
    });

    it('calculates time saved', () => {
      seedAudit(trail, [
        { action: 'email.fetch' },
        { action: 'email.send' },
      ]);
      const stats = monitor.getStatistics('all');
      expect(stats.totalTimeSavedSeconds).toBe(60); // 2 * 30
    });
  });

  describe('enriched allowlist', () => {
    it('enriches allowlist with usage data', () => {
      allowlist.addService({
        serviceName: 'Gmail',
        domain: 'imap.gmail.com',
        protocol: 'IMAP',
        addedBy: 'onboarding',
      });
      seedAudit(trail, [
        { action: 'email.fetch' },
        { action: 'email.fetch' },
      ]);
      const enriched = monitor.getEnrichedAllowlist();
      expect(enriched.length).toBe(1);
      expect(enriched[0]!.service).toBe('Gmail');
      expect(enriched[0]!.connectionCount).toBeGreaterThan(0);
    });

    it('shows zero connections for unused services', () => {
      allowlist.addService({
        serviceName: 'Outlook',
        domain: 'outlook.office365.com',
        protocol: 'IMAP',
      });
      const enriched = monitor.getEnrichedAllowlist();
      expect(enriched[0]!.connectionCount).toBe(0);
    });
  });

  describe('unauthorized attempts', () => {
    it('returns empty when no rejected entries', () => {
      seedAudit(trail, [{ action: 'email.fetch' }]);
      const attempts = monitor.getUnauthorizedAttempts();
      expect(attempts).toEqual([]);
    });

    it('returns rejected entries', () => {
      trail.append({
        requestId: 'bad-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch',
        direction: 'response',
        status: 'rejected',
        payloadHash: 'h',
        signature: 's',
        metadata: { rejectionReason: 'domain_not_on_allowlist' },
      });
      const attempts = monitor.getUnauthorizedAttempts();
      expect(attempts.length).toBe(1);
      expect(attempts[0]!.blocked).toBe(true);
      expect(attempts[0]!.reason).toBe('domain_not_on_allowlist');
    });
  });

  describe('trust status', () => {
    it('reports clean when no rejected entries', () => {
      seedAudit(trail, [{ action: 'email.fetch' }]);
      const status = monitor.getTrustStatus();
      expect(status.clean).toBe(true);
      expect(status.unauthorizedCount).toBe(0);
    });

    it('reports not clean when rejected entries exist', () => {
      trail.append({
        requestId: 'bad-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch',
        direction: 'response',
        status: 'rejected',
        payloadHash: 'h',
        signature: 's',
      });
      const status = monitor.getTrustStatus();
      expect(status.clean).toBe(false);
      expect(status.unauthorizedCount).toBe(1);
    });

    it('includes active service count', () => {
      allowlist.addService({ serviceName: 'Gmail', domain: 'imap.gmail.com', protocol: 'IMAP' });
      allowlist.addService({ serviceName: 'Calendar', domain: 'caldav.google.com', protocol: 'CalDAV' });
      const status = monitor.getTrustStatus();
      expect(status.activeServiceCount).toBe(2);
    });
  });

  describe('timeline', () => {
    it('returns hourly timeline data', () => {
      seedAudit(trail, [
        { action: 'email.fetch', minutesAgo: 10 },
        { action: 'email.fetch', minutesAgo: 15 },
        { action: 'email.fetch', minutesAgo: 20 },
      ]);
      const timeline = monitor.getTimeline({ period: 'today', granularity: 'hour' });
      expect(Array.isArray(timeline)).toBe(true);
    });
  });
});
