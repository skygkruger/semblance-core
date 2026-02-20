// Tests for CoreIPCClient — request construction, signing, connection handling.

import { describe, it, expect, vi } from 'vitest';
import { signRequest, verifySignature } from '@semblance/core/types/signing.js';

describe('IPC Client - Request Signing', () => {
  const testKey = Buffer.from('a'.repeat(64), 'hex'); // 32-byte key

  it('signRequest produces a hex string', () => {
    const sig = signRequest(testKey, 'req-1', '2025-01-01T00:00:00.000Z', 'email.fetch', { folder: 'INBOX' });
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifySignature validates a correct signature', () => {
    const id = 'req-2';
    const timestamp = '2025-01-01T00:00:00.000Z';
    const action = 'email.send';
    const payload = { to: ['test@example.com'], subject: 'Hi', body: 'Hello' };

    const sig = signRequest(testKey, id, timestamp, action, payload);
    const valid = verifySignature(testKey, sig, id, timestamp, action, payload);
    expect(valid).toBe(true);
  });

  it('verifySignature rejects a wrong signature', () => {
    const sig = signRequest(testKey, 'req-3', '2025-01-01T00:00:00.000Z', 'email.fetch', {});
    const valid = verifySignature(testKey, sig, 'req-3', '2025-01-01T00:00:00.000Z', 'email.fetch', { tampered: true });
    expect(valid).toBe(false);
  });

  it('verifySignature rejects wrong key', () => {
    const wrongKey = Buffer.from('b'.repeat(64), 'hex');
    const sig = signRequest(testKey, 'req-4', '2025-01-01T00:00:00.000Z', 'email.fetch', {});
    const valid = verifySignature(wrongKey, sig, 'req-4', '2025-01-01T00:00:00.000Z', 'email.fetch', {});
    expect(valid).toBe(false);
  });

  it('verifySignature rejects modified timestamp', () => {
    const sig = signRequest(testKey, 'req-5', '2025-01-01T00:00:00.000Z', 'email.fetch', {});
    const valid = verifySignature(testKey, sig, 'req-5', '2025-01-02T00:00:00.000Z', 'email.fetch', {});
    expect(valid).toBe(false);
  });

  it('verifySignature rejects modified action', () => {
    const sig = signRequest(testKey, 'req-6', '2025-01-01T00:00:00.000Z', 'email.fetch', {});
    const valid = verifySignature(testKey, sig, 'req-6', '2025-01-01T00:00:00.000Z', 'email.send', {});
    expect(valid).toBe(false);
  });

  it('different payloads produce different signatures', () => {
    const sig1 = signRequest(testKey, 'req-7', '2025-01-01T00:00:00.000Z', 'email.fetch', { folder: 'INBOX' });
    const sig2 = signRequest(testKey, 'req-7', '2025-01-01T00:00:00.000Z', 'email.fetch', { folder: 'SENT' });
    expect(sig1).not.toBe(sig2);
  });

  it('same inputs produce same signature (deterministic)', () => {
    const args = ['req-8', '2025-01-01T00:00:00.000Z', 'email.fetch', { folder: 'INBOX' }] as const;
    const sig1 = signRequest(testKey, ...args);
    const sig2 = signRequest(testKey, ...args);
    expect(sig1).toBe(sig2);
  });
});
