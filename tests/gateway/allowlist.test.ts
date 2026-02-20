// Allowlist Tests — Proves only explicitly authorized domains are allowed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';

describe('Allowlist', () => {
  let db: Database.Database;
  let allowlist: Allowlist;

  beforeEach(() => {
    db = new Database(':memory:');
    allowlist = new Allowlist(db);
  });

  afterEach(() => {
    db.close();
  });

  it('empty allowlist rejects all domains', () => {
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(false);
    expect(allowlist.isAllowed('api.example.com')).toBe(false);
  });

  it('request to allowlisted domain passes', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);
  });

  it('request to non-allowlisted domain is rejected', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('evil.example.com')).toBe(false);
  });

  it('wildcard domains are rejected', () => {
    expect(() => {
      allowlist.addService({
        serviceName: 'All Google',
        domain: '*.google.com',
        protocol: 'https',
      });
    }).toThrow(/wildcard/i);
  });

  it('deactivated service is treated as not allowed', () => {
    const service = allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);

    allowlist.deactivateService(service.id);
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(false);
  });

  it('removed service is no longer allowed', () => {
    const service = allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);

    allowlist.removeService(service.id);
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(false);
  });

  it('listServices returns all services', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    allowlist.addService({
      serviceName: 'Google Calendar',
      domain: 'www.googleapis.com',
      port: 443,
      protocol: 'https',
    });

    const services = allowlist.listServices();
    expect(services).toHaveLength(2);
    expect(services.map(s => s.domain)).toContain('imap.gmail.com');
    expect(services.map(s => s.domain)).toContain('www.googleapis.com');
  });

  it('port-specific check works', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      port: 993,
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('imap.gmail.com', 993)).toBe(true);
    expect(allowlist.isAllowed('imap.gmail.com', 443)).toBe(false); // wrong port is rejected
  });

  it('null port in allowlist matches any port query', () => {
    allowlist.addService({
      serviceName: 'Gmail API',
      domain: 'www.googleapis.com',
      protocol: 'https',
      // No port specified — null in DB
    });
    expect(allowlist.isAllowed('www.googleapis.com', 443)).toBe(true);
    expect(allowlist.isAllowed('www.googleapis.com', 8080)).toBe(true);
    expect(allowlist.isAllowed('www.googleapis.com')).toBe(true);
  });

  it('each subdomain must be explicitly listed', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      protocol: 'imap',
    });
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);
    expect(allowlist.isAllowed('smtp.gmail.com')).toBe(false);
    expect(allowlist.isAllowed('gmail.com')).toBe(false);
  });
});
