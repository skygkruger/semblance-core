// Validation Pipeline Integration Tests — Proves the ordered, short-circuiting pipeline.
// Schema → Signature → Allowlist → Rate Limit → Anomaly → Log → Execute → Log
// Every rejection is logged. Every step short-circuits.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { signRequest, sha256 } from '@semblance/core';
import type { ActionType } from '@semblance/core';
import { AuditTrail } from '@semblance/gateway/audit/trail.js';
import { Allowlist } from '@semblance/gateway/security/allowlist.js';
import { RateLimiter } from '@semblance/gateway/security/rate-limiter.js';
import { AnomalyDetector } from '@semblance/gateway/security/anomaly-detector.js';
import { ServiceRegistry } from '@semblance/gateway/services/registry.js';
import { validateAndExecute, resetReplayProtection, type ValidatorDeps } from '@semblance/gateway/ipc/validator.js';

describe('Validation Pipeline', () => {
  let db: Database.Database;
  let auditTrail: AuditTrail;
  let allowlist: Allowlist;
  let rateLimiter: RateLimiter;
  let anomalyDetector: AnomalyDetector;
  let serviceRegistry: ServiceRegistry;
  let signingKey: Buffer;
  let deps: ValidatorDeps;

  const makeValidRequest = (overrides?: Partial<{
    id: string;
    action: ActionType;
    payload: Record<string, unknown>;
  }>) => {
    const id = overrides?.id ?? 'req_test_001';
    const timestamp = new Date().toISOString();
    const action: ActionType = overrides?.action ?? 'email.send';
    const payload = overrides?.payload ?? {
      to: ['user@example.com'],
      subject: 'Test',
      body: 'Hello',
    };
    const signature = signRequest(signingKey, id, timestamp, action, payload);

    return {
      id,
      timestamp,
      action,
      payload,
      source: 'core' as const,
      signature,
    };
  };

  beforeEach(() => {
    resetReplayProtection();
    db = new Database(':memory:');
    auditTrail = new AuditTrail(db);
    allowlist = new Allowlist(db);
    signingKey = randomBytes(32);
    rateLimiter = new RateLimiter({
      actionLimits: { 'email.send': 5 },
      globalLimit: 20,
      windowMs: 60_000,
    });
    anomalyDetector = new AnomalyDetector({
      burstThreshold: 10,
      burstWindowMs: 5000,
      maxPayloadBytes: 1_000_000,
    });
    serviceRegistry = new ServiceRegistry();

    deps = {
      signingKey,
      auditTrail,
      allowlist,
      rateLimiter,
      anomalyDetector,
      serviceRegistry,
    };
  });

  afterEach(() => {
    db.close();
  });

  // --- Fully valid request ---

  it('fully valid request passes through all steps and returns success', async () => {
    const request = makeValidRequest();
    const response = await validateAndExecute(request, deps);

    expect(response.status).toBe('success');
    expect(response.requestId).toBe('req_test_001');
    expect(response.auditRef).toBeTruthy();
    expect(response.data).toBeTruthy(); // Stub adapter returns data
  });

  it('audit trail shows both request (pending) and response entries', async () => {
    const request = makeValidRequest();
    await validateAndExecute(request, deps);

    const entries = auditTrail.getByRequestId('req_test_001');
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const pendingEntry = entries.find(e => e.status === 'pending');
    const successEntry = entries.find(e => e.status === 'success');
    expect(pendingEntry).toBeDefined();
    expect(successEntry).toBeDefined();
    expect(pendingEntry!.direction).toBe('request');
    expect(successEntry!.direction).toBe('response');
  });

  // --- Schema failure short-circuits ---

  it('schema failure short-circuits (no execution, no allowlist check)', async () => {
    const response = await validateAndExecute({
      id: 'bad_req',
      // Missing required fields
    }, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('SCHEMA_INVALID');

    // Should have an audit entry for the rejection
    const entries = auditTrail.getByRequestId('bad_req');
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]!.status).toBe('rejected');
  });

  it('null input produces schema error', async () => {
    const response = await validateAndExecute(null, deps);
    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('SCHEMA_INVALID');
    expect(response.requestId).toBe('unknown');
  });

  it('invalid action-specific payload is rejected', async () => {
    // email.send requires 'to' array, 'subject', 'body'
    const id = 'req_bad_payload';
    const timestamp = new Date().toISOString();
    const action: ActionType = 'email.send';
    const payload = { invalid: 'no to/subject/body' };
    const signature = signRequest(signingKey, id, timestamp, action, payload);

    const response = await validateAndExecute({
      id, timestamp, action, payload,
      source: 'core',
      signature,
    }, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('PAYLOAD_INVALID');
  });

  // --- Signature failure short-circuits ---

  it('signature failure short-circuits', async () => {
    const request = makeValidRequest();
    // Tamper with the signature
    const tampered = { ...request, signature: 'INVALID_SIGNATURE_0000000000000000000000000000000000000000000000000000000000000000' };
    const response = await validateAndExecute(tampered, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('SIGNATURE_INVALID');

    // Should be logged as rejection
    const entries = auditTrail.getByRequestId(request.id);
    expect(entries.some(e => e.status === 'rejected')).toBe(true);
  });

  it('tampered payload fails signature check', async () => {
    const request = makeValidRequest();
    // Change payload after signing
    const tampered = {
      ...request,
      payload: { ...request.payload, body: 'TAMPERED CONTENT' },
    };
    const response = await validateAndExecute(tampered, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('SIGNATURE_INVALID');
  });

  // --- Allowlist failure short-circuits ---

  it('allowlist failure short-circuits for service.api_call', async () => {
    // service.api_call targets a domain via the 'service' field
    const request = makeValidRequest({
      action: 'service.api_call',
      payload: {
        service: 'evil.example.com',
        endpoint: '/steal-data',
        method: 'GET',
      },
    });
    const response = await validateAndExecute(request, deps);

    expect(response.status).toBe('error');
    expect(response.error?.code).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('allowlisted domain passes for service.api_call', async () => {
    allowlist.addService({
      serviceName: 'API Example',
      domain: 'api.example.com',
      protocol: 'https',
    });
    // Pre-seed the anomaly detector so we don't get flagged
    anomalyDetector.markDomainSeen('api.example.com');

    const request = makeValidRequest({
      action: 'service.api_call',
      payload: {
        service: 'api.example.com',
        endpoint: '/data',
        method: 'GET',
      },
    });
    const response = await validateAndExecute(request, deps);

    expect(response.status).toBe('success');
  });

  // --- Rate limit failure short-circuits ---

  it('rate limit failure short-circuits', async () => {
    // Send 5 requests (the per-action limit for email.send)
    for (let i = 0; i < 5; i++) {
      const request = makeValidRequest({ id: `req_${i}` });
      const response = await validateAndExecute(request, deps);
      expect(response.status).toBe('success');
    }

    // 6th request should be rate limited
    const request = makeValidRequest({ id: 'req_rate_limited' });
    const response = await validateAndExecute(request, deps);

    expect(response.status).toBe('rate_limited');
    expect(response.error?.code).toBe('RATE_LIMITED');

    // Should be logged
    const entries = auditTrail.getByRequestId('req_rate_limited');
    expect(entries.some(e => e.status === 'rate_limited')).toBe(true);
  });

  // --- Anomaly detection ---

  it('burst anomaly triggers requires_approval', async () => {
    const burstDetector = new AnomalyDetector({
      burstThreshold: 3,
      burstWindowMs: 60_000,
      maxPayloadBytes: 1_000_000,
    });
    const burstDeps = { ...deps, anomalyDetector: burstDetector };

    // Send enough requests to trigger burst
    for (let i = 0; i < 3; i++) {
      burstDetector.check({ payload: {} }); // Push into burst range
    }

    const request = makeValidRequest({ id: 'req_burst' });
    const response = await validateAndExecute(request, burstDeps);

    expect(response.status).toBe('requires_approval');
    expect(response.error?.code).toBe('ANOMALY_DETECTED');
  });

  // --- Every rejection is logged ---

  it('every rejection is logged to audit trail with correct reason', async () => {
    // Schema rejection
    await validateAndExecute({ id: 'schema_fail' }, deps);

    // Signature rejection
    const badSig = makeValidRequest({ id: 'sig_fail' });
    await validateAndExecute({ ...badSig, signature: 'wrong'.padEnd(64, '0') }, deps);

    // Domain rejection
    const domainFail = makeValidRequest({
      id: 'domain_fail',
      action: 'service.api_call',
      payload: { service: 'blocked.com', endpoint: '/', method: 'GET' },
    });
    await validateAndExecute(domainFail, deps);

    // Check all rejections are logged
    const schemaEntries = auditTrail.getByRequestId('schema_fail');
    expect(schemaEntries.length).toBeGreaterThanOrEqual(1);
    expect(schemaEntries[0]!.status).toBe('rejected');

    const sigEntries = auditTrail.getByRequestId('sig_fail');
    expect(sigEntries.length).toBeGreaterThanOrEqual(1);
    expect(sigEntries[0]!.status).toBe('rejected');

    const domainEntries = auditTrail.getByRequestId('domain_fail');
    expect(domainEntries.length).toBeGreaterThanOrEqual(1);
    expect(domainEntries[0]!.status).toBe('rejected');
  });

  // --- Audit chain remains valid through the pipeline ---

  it('audit chain integrity holds after multiple pipeline executions', async () => {
    // Run several requests through the pipeline
    for (let i = 0; i < 5; i++) {
      const request = makeValidRequest({ id: `req_chain_${i}` });
      await validateAndExecute(request, deps);
    }

    // Also inject a failure
    await validateAndExecute({ id: 'chain_fail' }, deps);

    const integrity = auditTrail.verifyChainIntegrity();
    expect(integrity.valid).toBe(true);
  });

  // --- Non-targeted actions skip allowlist ---

  it('email.send skips allowlist check (not domain-targeted)', async () => {
    // email.send does not have a 'service' field, so no domain extraction
    const request = makeValidRequest({
      action: 'email.send',
      payload: {
        to: ['user@example.com'],
        subject: 'Test',
        body: 'Hello',
      },
    });
    const response = await validateAndExecute(request, deps);

    // Should succeed even with empty allowlist
    expect(response.status).toBe('success');
  });
});
