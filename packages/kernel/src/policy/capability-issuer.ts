import { randomUUID } from 'node:crypto';
import type {
  CapabilityConstraintsV1,
  CapabilityGrantV1,
  CapabilityResource,
  ExecutionDestination,
  ProcessSessionV1,
} from '@semblance/protocol';
import type { DeviceIdentity } from '../identity/device-identity.js';
import { KernelError } from '../errors.js';
import { capabilitySigningPayload, isoAfterMs, isoNow } from '../crypto/signing.js';
import type { SessionStore, StoredSession } from '../session/session-store.js';

export interface IssueCapabilityRequest {
  sessionId: string;
  workflowId: string;
  consentReceiptId?: string | null;
  executionDestination: ExecutionDestination;
  resource: CapabilityResource;
  operations: string[];
  purpose: string;
  constraints: CapabilityConstraintsV1;
  capabilityTtlMs?: number;
  auditCorrelationId?: string;
}

export class CapabilityIssuer {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly sessions: SessionStore,
    private readonly policyEpoch: number,
    private readonly defaultCapabilityTtlMs: number,
  ) {}

  async issue(request: IssueCapabilityRequest): Promise<CapabilityGrantV1> {
    const session = this.requireActiveSession(request.sessionId);
    const issuedAt = isoNow();
    const expiresAt = isoAfterMs(request.capabilityTtlMs ?? this.defaultCapabilityTtlMs);

    const unsigned = {
      schemaVersion: 1 as const,
      capabilityId: `cap-${randomUUID()}`,
      principalId: session.principalId,
      deviceId: session.deviceId,
      processId: session.processId,
      sessionId: session.sessionId,
      processType: session.processType,
      extensionInstanceId: session.extensionInstanceId,
      workflowId: request.workflowId,
      consentReceiptId: request.consentReceiptId ?? null,
      executionDestination: request.executionDestination,
      resource: request.resource,
      operations: request.operations,
      purpose: request.purpose,
      constraints: request.constraints,
      issuedAt,
      expiresAt,
      policyEpoch: this.policyEpoch,
      revocationEpoch: 0,
      auditCorrelationId: request.auditCorrelationId ?? `audit-${randomUUID()}`,
    };

    const signature = await this.identity.signPayload(capabilitySigningPayload(unsigned));

    return {
      ...unsigned,
      signature,
    };
  }

  requireActiveSession(sessionId: string): StoredSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new KernelError('INVALID_SESSION', `Session "${sessionId}" is not known to the kernel`);
    }
    if (this.sessions.isExpired(session)) {
      throw new KernelError('EXPIRED_SESSION', `Session "${sessionId}" has expired`);
    }
    return session;
  }

  validateSession(sessionId: string): ProcessSessionV1 {
    return this.requireActiveSession(sessionId);
  }
}

export function createCapabilityIssuer(
  identity: DeviceIdentity,
  sessions: SessionStore,
  policyEpoch: number,
  defaultCapabilityTtlMs = 300_000,
): CapabilityIssuer {
  return new CapabilityIssuer(identity, sessions, policyEpoch, defaultCapabilityTtlMs);
}
