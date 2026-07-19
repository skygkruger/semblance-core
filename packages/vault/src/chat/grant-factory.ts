import { randomUUID } from 'node:crypto';
import type { CapabilityGrantV1 } from '@semblance/protocol';

export interface CreateQueryLimitedVaultReadGrantParams {
  principalId: string;
  deviceId: string;
  processId?: string;
  sessionId?: string;
  query: string;
  limit: number;
  ttlMs?: number;
  clock?: () => number;
}

/**
 * Issue a short-lived, query-scoped vault read grant for local chat grounding.
 * Signature is a process-local marker — suitable for sidecar bootstrap without kernel crypto.
 */
export function createQueryLimitedVaultReadGrant(
  params: CreateQueryLimitedVaultReadGrantParams,
): CapabilityGrantV1 {
  const nowMs = params.clock?.() ?? Date.now();
  const issuedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + (params.ttlMs ?? 5 * 60 * 1000)).toISOString();
  const processId = params.processId ?? `core-${process.pid}`;
  const sessionId = params.sessionId ?? `session-${randomUUID()}`;

  return {
    schemaVersion: 1,
    capabilityId: `cap-vault-chat-${randomUUID()}`,
    principalId: params.principalId,
    deviceId: params.deviceId,
    processId,
    sessionId,
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-chat-grounding',
    consentReceiptId: null,
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read'],
    purpose: `Chat grounding document search: ${params.query.slice(0, 120)}`,
    dataScope: {
      domains: ['documents'],
      accounts: [],
      sources: ['local'],
      recordClasses: ['document'],
    },
    constraints: {
      domains: ['documents'],
      resultLimit: params.limit,
      sensitivityCeiling: 'personal',
    },
    issuedAt,
    expiresAt,
    policyEpoch: 1,
    revocationEpoch: 0,
    auditCorrelationId: `audit-vault-chat-${randomUUID()}`,
    signature: 'local-process:query-limited-read',
  };
}
