// Tests for PrivacyReportGenerator — report generation, formats, summary, audit trail hash.

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { PrivacyReportGenerator } from '@semblance/gateway/monitor/privacy-report.js';
import type { ActionType } from '@semblance/core';

function seedAudit(trail: AuditTrail, count: number): void {
  const actions: ActionType[] = ['email.fetch', 'email.send', 'calendar.fetch'];
  for (let i = 0; i < count; i++) {
    trail.append({
      requestId: `req-${i}`,
      timestamp: new Date(Date.now() - (count - i) * 60000).toISOString(),
      action: actions[i % actions.length]!,
      direction: 'response',
      status: 'success',
      payloadHash: `hash-${i}`,
      signature: `sig-${i}`,
      estimatedTimeSavedSeconds: 30,
    });
  }
}

describe('PrivacyReportGenerator', () => {
  let auditDb: Database.Database;
  let configDb: Database.Database;
  let trail: AuditTrail;
  let allowlist: Allowlist;
  let generator: PrivacyReportGenerator;

  beforeEach(() => {
    auditDb = new Database(':memory:');
    configDb = new Database(':memory:');
    trail = new AuditTrail(auditDb);
    allowlist = new Allowlist(configDb);
    generator = new PrivacyReportGenerator({
      auditDb,
      allowlist,
      appVersion: '0.2.0-test',
      deviceId: 'test-device',
    });
  });

  describe('generate', () => {
    it('generates a report with correct metadata', () => {
      seedAudit(trail, 5);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.metadata.appVersion).toBe('0.2.0-test');
      expect(report.metadata.deviceId).toBe('test-device');
      expect(report.metadata.generatedAt).toBeTruthy();
      expect(report.metadata.period.start).toBeTruthy();
      expect(report.metadata.period.end).toBeTruthy();
    });

    it('includes correct connection count', () => {
      seedAudit(trail, 8);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.summary.totalConnections).toBe(8);
    });

    it('includes service breakdown', () => {
      seedAudit(trail, 6);
      allowlist.addService({ serviceName: 'Gmail', domain: 'imap.gmail.com', protocol: 'IMAP' });
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.services.length).toBeGreaterThan(0);
      for (const svc of report.services) {
        expect(svc).toHaveProperty('name');
        expect(svc).toHaveProperty('connectionCount');
      }
    });

    it('reports zero unauthorized attempts when clean', () => {
      seedAudit(trail, 3);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.summary.unauthorizedAttempts).toBe(0);
    });

    it('reports unauthorized attempts when present', () => {
      trail.append({
        requestId: 'bad-1',
        timestamp: new Date().toISOString(),
        action: 'email.fetch',
        direction: 'response',
        status: 'rejected',
        payloadHash: 'h',
        signature: 's',
      });
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.summary.unauthorizedAttempts).toBe(1);
    });

    it('includes audit trail hash', () => {
      seedAudit(trail, 5);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.auditTrailHash).toBeTruthy();
      expect(typeof report.auditTrailHash).toBe('string');
    });

    it('generates privacy statement for clean period', () => {
      seedAudit(trail, 3);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.statement).toContain('user-authorized services');
      expect(report.statement).toContain('No data was transmitted to unauthorized destinations');
    });

    it('includes time-saved total', () => {
      seedAudit(trail, 4);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'json',
      });
      expect(report.summary.totalTimeSavedSeconds).toBe(120); // 4 * 30
    });

    it('handles empty period correctly', () => {
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() - 86300000).toISOString(), // very narrow range
        format: 'json',
      });
      expect(report.summary.totalConnections).toBe(0);
      expect(report.auditTrailHash).toBeTruthy();
    });
  });

  describe('formatAsText', () => {
    it('generates readable text report', () => {
      seedAudit(trail, 3);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'text',
      });
      const text = generator.formatAsText(report);
      expect(text).toContain('SEMBLANCE PRIVACY REPORT');
      expect(text).toContain('Total Connections');
      expect(text).toContain('Unauthorized Attempts: 0');
      expect(text).toContain('End of Report');
    });

    it('includes services in text output', () => {
      seedAudit(trail, 5);
      const report = generator.generate({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        format: 'text',
      });
      const text = generator.formatAsText(report);
      expect(text).toContain('Connections:');
    });
  });
});
