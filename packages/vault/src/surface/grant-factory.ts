import { randomUUID } from 'node:crypto';
import type { CapabilityGrantV1 } from '@semblance/protocol';

export interface CreateVaultSurfaceReadGrantParams {
  principalId: string;
  deviceId: string;
  processId?: string;
  sessionId?: string;
  resultLimit?: number;
  ttlMs?: number;
  clock?: () => number;
}

/**
 * Issue a short-lived vault read grant for personal vault surface inspection.
 */
export function createVaultSurfaceReadGrant(
  params: CreateVaultSurfaceReadGrantParams,
): CapabilityGrantV1 {
  const nowMs = params.clock?.() ?? Date.now();
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (params.ttlMs ?? 10 * 60 * 1000)).toISOString();
  const processId = params.processId ?? `sidecar-${process.pid}`;
  const sessionId = params.sessionId ?? `session-${randomUUID()}`;

  return {
    schemaVersion: 1,
    capabilityId: `cap-vault-surface-${randomUUID()}`,
    principalId: params.principalId,
    deviceId: params.deviceId,
    processId,
    sessionId,
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-surface',
    consentReceiptId: null,
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Personal vault surface inspection and deletion',
    dataScope: {
      domains: ['documents', 'personal'],
      accounts: [],
      sources: ['local'],
      recordClasses: ['document', 'assertion', 'event'],
    },
    constraints: {
      domains: ['documents', 'personal'],
      resultLimit: params.resultLimit ?? 500,
      sensitivityCeiling: 'restricted',
    },
    issuedAt,
    expiresAt,
    policyEpoch: 1,
    revocationEpoch: 0,
    auditCorrelationId: `audit-vault-surface-${randomUUID()}`,
    signature: 'local-process:vault-surface-read',
  };
}
