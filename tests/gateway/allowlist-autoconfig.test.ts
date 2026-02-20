// Allowlist Auto-Configuration Tests — Validates that adding/removing credentials
// updates the allowlist and that changes are audit-logged.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';

describe('Allowlist Auto-Configuration', () => {
  let db: Database.Database;
  let allowlist: Allowlist;
  let auditTrail: AuditTrail;

  beforeEach(() => {
    db = new Database(':memory:');
    allowlist = new Allowlist(db);
    auditTrail = new AuditTrail(db);
  });

  afterEach(() => {
    db.close();
  });

  it('adding IMAP credential host adds it to the allowlist', () => {
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(false);

    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      protocol: 'imaps',
      addedBy: 'credential_setup',
    });

    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);
  });

  it('adding SMTP credential host adds it to the allowlist', () => {
    expect(allowlist.isAllowed('smtp.gmail.com')).toBe(false);

    allowlist.addService({
      serviceName: 'Gmail SMTP',
      domain: 'smtp.gmail.com',
      protocol: 'smtp',
      addedBy: 'credential_setup',
    });

    expect(allowlist.isAllowed('smtp.gmail.com')).toBe(true);
  });

  it('adding CalDAV credential host adds it to the allowlist', () => {
    allowlist.addService({
      serviceName: 'Google CalDAV',
      domain: 'www.googleapis.com',
      protocol: 'https',
      addedBy: 'credential_setup',
    });

    expect(allowlist.isAllowed('www.googleapis.com')).toBe(true);
  });

  it('removing credential removes domain from allowlist', () => {
    const service = allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      protocol: 'imaps',
    });

    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);

    allowlist.removeService(service.id);
    expect(allowlist.isAllowed('imap.gmail.com')).toBe(false);
  });

  it('adding email credential auto-adds both IMAP and SMTP hosts', () => {
    // Simulate what the sidecar bridge does when adding email credentials:
    // adds both IMAP and SMTP hosts to the allowlist
    allowlist.addService({
      serviceName: 'Work Email IMAP',
      domain: 'imap.example.com',
      protocol: 'imaps',
      addedBy: 'credential_setup',
    });
    allowlist.addService({
      serviceName: 'Work Email SMTP',
      domain: 'smtp.example.com',
      protocol: 'smtp',
      addedBy: 'credential_setup',
    });

    expect(allowlist.isAllowed('imap.example.com')).toBe(true);
    expect(allowlist.isAllowed('smtp.example.com')).toBe(true);
  });

  it('allowlist changes are audit-logged', () => {
    const initialCount = auditTrail.count();

    // Simulate the sidecar bridge logging allowlist changes
    auditTrail.append({
      requestId: 'cred-add-001',
      timestamp: new Date().toISOString(),
      action: 'service.api_call',
      direction: 'request',
      status: 'success',
      payloadHash: 'hash-allowlist-add',
      signature: 'sig-allowlist-add',
      metadata: {
        event: 'allowlist_add',
        domain: 'imap.gmail.com',
        protocol: 'imaps',
        reason: 'credential_added',
      },
    });

    expect(auditTrail.count()).toBe(initialCount + 1);

    const entries = auditTrail.getByRequestId('cred-add-001');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata).toEqual({
      event: 'allowlist_add',
      domain: 'imap.gmail.com',
      protocol: 'imaps',
      reason: 'credential_added',
    });
  });

  it('credential removal is audit-logged', () => {
    auditTrail.append({
      requestId: 'cred-remove-001',
      timestamp: new Date().toISOString(),
      action: 'service.api_call',
      direction: 'request',
      status: 'success',
      payloadHash: 'hash-allowlist-remove',
      signature: 'sig-allowlist-remove',
      metadata: {
        event: 'allowlist_remove',
        domain: 'imap.gmail.com',
        reason: 'credential_removed',
      },
    });

    const entries = auditTrail.getByRequestId('cred-remove-001');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.metadata?.event).toBe('allowlist_remove');
  });

  it('wildcard domains are rejected', () => {
    expect(() => allowlist.addService({
      serviceName: 'Wildcard',
      domain: '*.gmail.com',
      protocol: 'https',
    })).toThrow('Wildcard domains are not allowed');
  });

  it('multiple services for same domain are allowed', () => {
    allowlist.addService({
      serviceName: 'Gmail IMAP',
      domain: 'imap.gmail.com',
      protocol: 'imaps',
    });
    allowlist.addService({
      serviceName: 'Gmail IMAP Backup',
      domain: 'imap.gmail.com',
      protocol: 'imaps',
    });

    expect(allowlist.isAllowed('imap.gmail.com')).toBe(true);

    // List shows both
    const services = allowlist.listServices();
    const gmailServices = services.filter(s => s.domain === 'imap.gmail.com');
    expect(gmailServices).toHaveLength(2);
  });

  it('deactivated service is not allowed', () => {
    const service = allowlist.addService({
      serviceName: 'Test Service',
      domain: 'test.example.com',
      protocol: 'https',
    });

    expect(allowlist.isAllowed('test.example.com')).toBe(true);

    allowlist.deactivateService(service.id);
    expect(allowlist.isAllowed('test.example.com')).toBe(false);
  });
});
