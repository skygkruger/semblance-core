// Signing Tests — Proves HMAC-SHA256 signing and verification work correctly.

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { signRequest, verifySignature, sha256, buildSigningPayload } from '@semblance/core';

describe('Action Signing', () => {
  const key = randomBytes(32);
  const id = 'req_test_001';
  const timestamp = '2026-01-15T10:30:00.000Z';
  const action = 'email.send';
  const payload = { to: ['user@example.com'], subject: 'Test', body: 'Hello' };

  it('sha256 produces consistent hashes', () => {
    const h1 = sha256('test data');
    const h2 = sha256('test data');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // hex-encoded SHA-256
  });

  it('sha256 produces different hashes for different input', () => {
    const h1 = sha256('data A');
    const h2 = sha256('data B');
    expect(h1).not.toBe(h2);
  });

  it('buildSigningPayload produces expected format', () => {
    const result = buildSigningPayload(id, timestamp, action, payload);
    const payloadHash = sha256(JSON.stringify(payload));
    expect(result).toBe(`${id}|${timestamp}|${action}|${payloadHash}`);
  });

  it('valid signature passes verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const valid = verifySignature(key, sig, id, timestamp, action, payload);
    expect(valid).toBe(true);
  });

  it('tampered payload fails verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const tamperedPayload = { ...payload, body: 'TAMPERED' };
    const valid = verifySignature(key, sig, id, timestamp, action, tamperedPayload);
    expect(valid).toBe(false);
  });

  it('tampered timestamp fails verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const valid = verifySignature(key, sig, id, '2026-12-31T23:59:59.000Z', action, payload);
    expect(valid).toBe(false);
  });

  it('tampered action type fails verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const valid = verifySignature(key, sig, id, timestamp, 'calendar.create', payload);
    expect(valid).toBe(false);
  });

  it('tampered id fails verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const valid = verifySignature(key, sig, 'req_TAMPERED', timestamp, action, payload);
    expect(valid).toBe(false);
  });

  it('wrong key fails verification', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    const wrongKey = randomBytes(32);
    const valid = verifySignature(wrongKey, sig, id, timestamp, action, payload);
    expect(valid).toBe(false);
  });

  it('empty signature fails verification', () => {
    const valid = verifySignature(key, '', id, timestamp, action, payload);
    expect(valid).toBe(false);
  });

  it('signature is hex-encoded and correct length', () => {
    const sig = signRequest(key, id, timestamp, action, payload);
    expect(sig).toMatch(/^[0-9a-f]+$/);
    expect(sig).toHaveLength(64); // SHA-256 = 32 bytes = 64 hex chars
  });
});
