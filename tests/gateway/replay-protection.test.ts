// Replay Protection Tests — Timestamp freshness + request ID deduplication.
// Finding #4 (HIGH): No IPC replay protection — captured requests replayable forever.
// Finding #5 (HIGH): ActionRequest.payload uses z.record(z.unknown()) — wide-open.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { signRequest } from '@semblance/core';
import type { ActionType } from '@semblance/core';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { RateLimiter } from '@semblance/gateway/security/rate-limiter.js';
import { AnomalyDetector } from '@semblance/gateway/security/anomaly-detector.js';
import { ServiceRegistry } from '@semblance/gateway/services/registry.js';
import { validateAndExecute, type ValidatorDeps } from '@semblance/gateway/ipc/validator.js';
import { ActionPayloadMap } from '@semblance/core';

describe('IPC Replay Protection', () => {
  let db: Database.Database;
  let signingKey: Buffer;
  let deps: ValidatorDeps;

  const makeRequest = (overrides?: Partial<{
    id: string;
    timestamp: string;
    action: ActionType;
    payload: Record<string, unknown>;
  }>) => {
    const id = overrides?.id ?? `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timestamp = overrides?.timestamp ?? new Date().toISOString();
    const action: ActionType = overrides?.action ?? 'email.send';
    const payload = overrides?.payload ?? {
      to: ['user@example.com'],
      subject: 'Test',
      body: 'Hello',
    };
    const signature = signRequest(signingKey, id, timestamp, action, payload);
    return { id, timestamp, action, payload, source: 'core' as const, signature };
  };

  beforeEach(() => {
    db = new Database(':memory:');
    signingKey = randomBytes(32);
    deps = {
      signingKey,
      auditTrail: new AuditTrail(db),
      allowlist: new Allowlist(db),
      rateLimiter: new RateLimiter({
        actionLimits: { 'email.send': 100 },
        globalLimit: 200,
        windowMs: 60_000,
      }),
      anomalyDetector: new AnomalyDetector({
        burstThreshold: 100,
        burstWindowMs: 5000,
        maxPayloadBytes: 1_000_000,
      }),
      serviceRegistry: new ServiceRegistry(),
    };
  });

  afterEach(() => {
    db.close();
  });

  it('rejects requests with timestamps older than 30 seconds', async () => {
    const staleTimestamp = new Date(Date.now() - 31_000).toISOString();
    const req = makeRequest({ timestamp: staleTimestamp });
    const result = await validateAndExecute(req, deps);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('TIMESTAMP_STALE');
  });

  it('rejects requests with future timestamps', async () => {
    const futureTimestamp = new Date(Date.now() + 60_000).toISOString();
    const req = makeRequest({ timestamp: futureTimestamp });
    const result = await validateAndExecute(req, deps);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('TIMESTAMP_STALE');
  });

  it('accepts requests with fresh timestamps', async () => {
    const req = makeRequest({ timestamp: new Date().toISOString() });
    const result = await validateAndExecute(req, deps);

    // Should pass timestamp check (may fail on allowlist or execution, but not timestamp)
    expect(result.error?.code).not.toBe('TIMESTAMP_STALE');
    expect(result.error?.code).not.toBe('REQUEST_REPLAYED');
  });

  it('rejects duplicate request IDs', async () => {
    const id = 'req_duplicate_test';
    const req1 = makeRequest({ id });
    const req2 = makeRequest({ id });

    // First request should pass replay checks
    const result1 = await validateAndExecute(req1, deps);
    expect(result1.error?.code).not.toBe('REQUEST_REPLAYED');

    // Second request with same ID should be rejected
    const result2 = await validateAndExecute(req2, deps);
    expect(result2.status).toBe('error');
    expect(result2.error?.code).toBe('REQUEST_REPLAYED');
  });

  it('accepts different request IDs', async () => {
    const req1 = makeRequest({ id: 'req_unique_1' });
    const req2 = makeRequest({ id: 'req_unique_2' });

    const result1 = await validateAndExecute(req1, deps);
    expect(result1.error?.code).not.toBe('REQUEST_REPLAYED');

    const result2 = await validateAndExecute(req2, deps);
    expect(result2.error?.code).not.toBe('REQUEST_REPLAYED');
  });

  it('rejects requests with invalid (non-ISO) timestamps', async () => {
    const req = makeRequest({ timestamp: 'not-a-date' });
    const result = await validateAndExecute(req, deps);

    // Schema validation should catch invalid datetime format
    expect(result.status).toBe('error');
  });
});

describe('ActionPayloadMap Strictness', () => {
  it('rejects payloads with unknown fields via .strict()', () => {
    const schema = ActionPayloadMap['email.send'];
    const result = schema.safeParse({
      to: ['user@example.com'],
      subject: 'Test',
      body: 'Hello',
      malicious_field: 'injected',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('malicious_field');
    }
  });

  it('accepts valid payloads without extra fields', () => {
    const schema = ActionPayloadMap['email.send'];
    const result = schema.safeParse({
      to: ['user@example.com'],
      subject: 'Test',
      body: 'Hello',
    });

    expect(result.success).toBe(true);
  });

  it('rejects extra fields on web.fetch payload', () => {
    const schema = ActionPayloadMap['web.fetch'];
    const result = schema.safeParse({
      url: 'https://example.com',
      maxContentLength: 1000,
      __proto__: { admin: true },
    });

    // Should reject — __proto__ is not a valid field
    expect(result.success).toBe(false);
  });

  it('rejects extra fields on calendar.create payload', () => {
    const schema = ActionPayloadMap['calendar.create'];
    const result = schema.safeParse({
      title: 'Meeting',
      startTime: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T11:00:00Z',
      inject_admin: true,
    });

    expect(result.success).toBe(false);
  });
});
