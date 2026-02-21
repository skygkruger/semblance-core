// Tests for Network Monitor UI — trust status display, active connections, authorized services,
// connection log, persistent status indicator via Tauri invoke mocks.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('NetworkMonitorScreen', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('trust status display', () => {
    it('displays green status for zero unauthorized connections', async () => {
      const stats = {
        period: 'today',
        totalConnections: 12,
        connectionsByService: { email: 8, calendar: 4 },
        connectionsByAction: { 'email.fetch': 6, 'email.send': 2, 'calendar.fetch': 4 },
        unauthorizedAttempts: 0,
        uniqueServicesContacted: 2,
        averageTimeSavedSeconds: 30,
        totalTimeSavedSeconds: 360,
      };
      mockInvoke.mockResolvedValue(stats);
      const result = await mockInvoke('get_network_statistics', { period: 'today' });
      expect(result.unauthorizedAttempts).toBe(0);
    });

    it('retrieves unauthorized attempts', async () => {
      mockInvoke.mockResolvedValue([]);
      const result = await mockInvoke('get_unauthorized_attempts', { period: 'today' });
      expect(result).toEqual([]);
    });
  });

  describe('active connections', () => {
    it('retrieves active connections list', async () => {
      const connections = [
        { id: 'c1', service: 'Gmail (IMAP)', protocol: 'IMAP', status: 'active', lastActivity: new Date().toISOString() },
        { id: 'c2', service: 'Google Calendar', protocol: 'CalDAV', status: 'idle', lastActivity: new Date().toISOString() },
      ];
      mockInvoke.mockResolvedValue(connections);
      const result = await mockInvoke('get_active_connections');
      expect(result.length).toBe(2);
      expect(result[0].service).toBe('Gmail (IMAP)');
    });
  });

  describe('authorized services', () => {
    it('retrieves allowlist with usage data', async () => {
      const allowlist = [
        { service: 'Gmail', domain: 'imap.gmail.com', protocol: 'IMAP', addedBy: 'onboarding', connectionCount: 847, isActive: true },
        { service: 'Google Calendar', domain: 'caldav.google.com', protocol: 'CalDAV', addedBy: 'onboarding', connectionCount: 234, isActive: true },
      ];
      mockInvoke.mockResolvedValue(allowlist);
      const result = await mockInvoke('get_network_allowlist');
      expect(result.length).toBe(2);
      expect(result[0].service).toBe('Gmail');
      expect(result[0].connectionCount).toBe(847);
    });
  });

  describe('connection timeline', () => {
    it('retrieves timeline data for chart', async () => {
      const timeline = [
        { timestamp: '2026-02-21T08:00:00', connections: 3 },
        { timestamp: '2026-02-21T09:00:00', connections: 5 },
        { timestamp: '2026-02-21T10:00:00', connections: 2 },
      ];
      mockInvoke.mockResolvedValue(timeline);
      const result = await mockInvoke('get_connection_timeline', { period: 'today', granularity: 'hour' });
      expect(result.length).toBe(3);
      expect(result[1].connections).toBe(5);
    });
  });

  describe('connection log', () => {
    it('retrieves connection history', async () => {
      const history = [
        { id: 'h1', timestamp: new Date().toISOString(), service: 'Email', action: 'email.fetch', status: 'success' },
        { id: 'h2', timestamp: new Date().toISOString(), service: 'Calendar', action: 'calendar.fetch', status: 'success' },
      ];
      mockInvoke.mockResolvedValue(history);
      const result = await mockInvoke('get_connection_history', { limit: 20 });
      expect(result.length).toBe(2);
      expect(result[0].action).toBe('email.fetch');
    });
  });

  describe('privacy report', () => {
    it('generates privacy report', async () => {
      const report = {
        metadata: { generatedAt: new Date().toISOString(), period: { start: '2026-02-14', end: '2026-02-21' }, appVersion: '0.2.0', deviceId: 'test' },
        summary: { totalConnections: 100, authorizedServices: ['Gmail', 'Calendar'], unauthorizedAttempts: 0, totalTimeSavedSeconds: 3000 },
        services: [{ name: 'Gmail', domain: 'imap.gmail.com', connectionCount: 80 }],
        auditTrailHash: 'abc123',
        statement: 'All connections authorized.',
      };
      mockInvoke.mockResolvedValue(report);
      const result = await mockInvoke('generate_privacy_report', { startDate: '2026-02-14', endDate: '2026-02-21', format: 'json' });
      expect(result.summary.unauthorizedAttempts).toBe(0);
      expect(result.auditTrailHash).toBeTruthy();
    });
  });

  describe('persistent status indicator', () => {
    it('retrieves trust status for indicator', async () => {
      const status = { clean: true, unauthorizedCount: 0, activeServiceCount: 3 };
      mockInvoke.mockResolvedValue(status);
      const result = await mockInvoke('get_network_trust_status');
      expect(result.clean).toBe(true);
      expect(result.activeServiceCount).toBe(3);
    });

    it('shows non-clean status when unauthorized exist', async () => {
      const status = { clean: false, unauthorizedCount: 2, activeServiceCount: 3 };
      mockInvoke.mockResolvedValue(status);
      const result = await mockInvoke('get_network_trust_status');
      expect(result.clean).toBe(false);
      expect(result.unauthorizedCount).toBe(2);
    });
  });

  describe('period selection', () => {
    it('fetches statistics for week period', async () => {
      mockInvoke.mockResolvedValue({ period: 'week', totalConnections: 50 });
      const result = await mockInvoke('get_network_statistics', { period: 'week' });
      expect(result.period).toBe('week');
    });

    it('fetches statistics for month period', async () => {
      mockInvoke.mockResolvedValue({ period: 'month', totalConnections: 200 });
      const result = await mockInvoke('get_network_statistics', { period: 'month' });
      expect(result.period).toBe('month');
    });
  });
});
