// TLS + Certificate Pinning Tests — TLS 1.3 enforcement and pin registry.

import { describe, it, expect } from 'vitest';
import { getTlsOptions, createSecureAgentOptions, MIN_TLS_VERSION } from '@semblance/gateway/security/tls-config.js';
import { CertificatePinRegistry } from '@semblance/gateway/security/certificate-pins.js';

describe('TLS Configuration', () => {
  it('enforces TLS 1.3 minimum', () => {
    const opts = getTlsOptions();
    expect(opts.minVersion).toBe('TLSv1.3');
  });

  it('createSecureAgentOptions returns correct defaults', () => {
    const opts = createSecureAgentOptions();
    expect(opts.minVersion).toBe(MIN_TLS_VERSION);
    expect(opts.rejectUnauthorized).toBe(true);
    expect(opts.ciphers).toContain('TLS_AES_256_GCM_SHA384');
  });
});

describe('Certificate Pin Registry', () => {
  it('loadDefaults registers known service domains', () => {
    const registry = new CertificatePinRegistry();
    registry.loadDefaults();
    const domains = registry.getDomains();
    expect(domains).toContain('imap.gmail.com');
    expect(domains).toContain('smtp.gmail.com');
    expect(domains).toContain('production.plaid.com');
  });

  it('verifyPin rejects mismatched fingerprint after TOFU', () => {
    const registry = new CertificatePinRegistry();
    registry.addPin({
      domain: 'test.example.com',
      fingerprints: ['AA:BB:CC:DD'],
      enforced: true,
      description: 'Test service',
    });
    expect(registry.isPinned('test.example.com')).toBe(true);
    expect(registry.verifyPin('test.example.com', 'AA:BB:CC:DD')).toBe(true);
    expect(registry.verifyPin('test.example.com', 'XX:YY:ZZ:WW')).toBe(false);
  });

  it('recordFirstUse pins a certificate on first connection', () => {
    const registry = new CertificatePinRegistry();
    registry.loadDefaults();
    expect(registry.isPinned('imap.gmail.com')).toBe(false);
    registry.recordFirstUse('imap.gmail.com', 'FIRST:CERT:FP');
    expect(registry.isPinned('imap.gmail.com')).toBe(true);
    expect(registry.verifyPin('imap.gmail.com', 'FIRST:CERT:FP')).toBe(true);
    expect(registry.verifyPin('imap.gmail.com', 'DIFFERENT:FP')).toBe(false);
  });
});
