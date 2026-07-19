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
import { validateAndExecute, resetReplayProtection, type ValidatorDeps } from '@semblance/gateway/ipc/validator.js';

describe('Gateway autonomy capability enforcement', () => {
  let db: Database.Database;
  let deps: ValidatorDeps;
  let signingKey: Buffer;
  let executed: boolean;

  const makeRequest = (
    overrides?: Partial<{ id: string; action: ActionType; payload: Record<string, unknown> }>,
  ) => {
    const id = overrides?.id ?? 'req_autonomy_001';
    const timestamp = new Date().toISOString();
    const action: ActionType = overrides?.action ?? 'email.send';
    const payload = overrides?.payload ?? {
      to: ['novel@unknown.com'],
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
    executed = false;
    db = new Database(':memory:');
    signingKey = randomBytes(32);

    deps = {
      signingKey,
      auditTrail: new AuditTrail(db),
      allowlist: new Allowlist(db),
      rateLimiter: new RateLimiter(),
      anomalyDetector: new AnomalyDetector(),
      serviceRegistry: new ServiceRegistry(),
      getAutonomyTier: () => 'guardian',
      getPriorApprovalsForCapability: () => 0,
    };

    deps.serviceRegistry.register('email.send', {
      async execute() {
        executed = true;
        return { success: true, data: { sent: true } };
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it('Guardian email.send returns requires_approval and does not execute', async () => {
    const response = await validateAndExecute(makeRequest(), deps);

    expect(response.status).toBe('requires_approval');
    expect(response.error?.code).toBe('AUTONOMY_REQUIRES_APPROVAL');
    expect(executed).toBe(false);
  });

  it('Partner email.draft with sufficient routine context executes', async () => {
    deps.getAutonomyTier = () => 'partner';
    deps.serviceRegistry.register('email.draft', {
      async execute() {
        executed = true;
        return { success: true, data: { draftId: 'draft-1' } };
      },
    });

    const response = await validateAndExecute(
      makeRequest({
        id: 'req_autonomy_draft',
        action: 'email.draft',
        payload: {
          to: ['user@example.com'],
          subject: 'Draft',
          body: 'Draft body',
        },
      }),
      deps,
    );

    expect(response.status).toBe('success');
    expect(executed).toBe(true);
  });
});
