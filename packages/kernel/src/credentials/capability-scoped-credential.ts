import { randomUUID } from 'node:crypto';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import type { CapabilityIssuer } from '../policy/capability-issuer.js';
import type { SessionStore } from '../session/session-store.js';
import {
  type ConnectorSecretKind,
  type ConnectorSecretStore,
} from './connector-secret-store.js';
import { CredentialAccessError } from './credential-access-error.js';

const CREDENTIAL_READ_PREFIX = 'credential.read';

export interface CredentialAccessGrant {
  grant: CapabilityGrantV1;
  provider: string;
  accountId?: string;
  secretKind: ConnectorSecretKind;
}

export interface IssueCredentialAccessParams {
  sessionId: string;
  principalId: string;
  provider: string;
  accountId?: string;
  secretKind: ConnectorSecretKind;
  purpose: string;
  workflowId?: string;
  ttlMs?: number;
}

export interface CapabilityScopedCredentialConfig {
  secretStore: ConnectorSecretStore;
  sessions?: SessionStore;
  capabilityIssuer?: CapabilityIssuer;
  localPrincipalId?: string;
  localDeviceId?: string;
  localProcessId?: string;
  defaultGrantTtlMs?: number;
  clock?: () => number;
}

function accountScopeKey(provider: string, accountId?: string): string {
  return accountId ?? provider;
}

function credentialOperation(kind: ConnectorSecretKind): string {
  return `${CREDENTIAL_READ_PREFIX}.${kind}`;
}

export class CapabilityScopedCredentialService {
  private readonly secretStore: ConnectorSecretStore;
  private readonly sessions?: SessionStore;
  private readonly capabilityIssuer?: CapabilityIssuer;
  private readonly localPrincipalId: string;
  private readonly localDeviceId: string;
  private readonly localProcessId: string;
  private readonly defaultGrantTtlMs: number;
  private readonly clock: () => number;

  constructor(config: CapabilityScopedCredentialConfig) {
    this.secretStore = config.secretStore;
    this.sessions = config.sessions;
    this.capabilityIssuer = config.capabilityIssuer;
    this.localPrincipalId = config.localPrincipalId ?? 'local-gateway';
    this.localDeviceId = config.localDeviceId ?? 'local-device';
    this.localProcessId = config.localProcessId ?? `gateway-${process.pid}`;
    this.defaultGrantTtlMs = config.defaultGrantTtlMs ?? 60_000;
    this.clock = config.clock ?? (() => Date.now());
  }

  async issueCredentialAccess(params: IssueCredentialAccessParams): Promise<CredentialAccessGrant> {
    if (this.sessions) {
      const session = this.sessions.get(params.sessionId);
      if (!session) {
        throw new CredentialAccessError(
          'INVALID_SESSION',
          `Session "${params.sessionId}" is not known to the kernel`,
        );
      }
      if (this.sessions.isExpired(session, this.clock())) {
        throw new CredentialAccessError(
          'INVALID_SESSION',
          `Session "${params.sessionId}" has expired`,
        );
      }
      if (session.principalId !== params.principalId) {
        throw new CredentialAccessError(
          'WRONG_PRINCIPAL',
          `Session principal "${session.principalId}" does not match caller "${params.principalId}"`,
        );
      }
    }

    const targetAccount = accountScopeKey(params.provider, params.accountId);
    const operation = credentialOperation(params.secretKind);

    const grant = this.capabilityIssuer
      ? await this.capabilityIssuer.issue({
          sessionId: params.sessionId,
          workflowId: params.workflowId ?? 'wf-connector-credential',
          executionDestination: 'gateway',
          resource: 'gateway',
          operations: [operation],
          purpose: params.purpose,
          constraints: { accounts: [targetAccount] },
          capabilityTtlMs: params.ttlMs ?? this.defaultGrantTtlMs,
        })
      : this.issueLocalGrant(params, targetAccount, operation);

    return {
      grant,
      provider: params.provider,
      accountId: params.accountId,
      secretKind: params.secretKind,
    };
  }

  async redeemCredentialAccess(
    access: CredentialAccessGrant,
    callerPrincipalId: string,
    nowMs: number = this.clock(),
  ): Promise<string> {
    const { grant } = access;

    if (grant.principalId !== callerPrincipalId) {
      throw new CredentialAccessError(
        'WRONG_PRINCIPAL',
        `Capability principal "${grant.principalId}" does not match caller "${callerPrincipalId}"`,
      );
    }

    const expiresAtMs = Date.parse(grant.expiresAt);
    if (Number.isNaN(expiresAtMs) || nowMs >= expiresAtMs) {
      throw new CredentialAccessError(
        'EXPIRED_GRANT',
        `Capability "${grant.capabilityId}" expired at ${grant.expiresAt}`,
      );
    }

    const expectedOperation = credentialOperation(access.secretKind);
    if (!grant.operations.includes(expectedOperation)) {
      throw new CredentialAccessError(
        'OPERATION_NOT_PERMITTED',
        `Operation "${expectedOperation}" is not permitted by capability "${grant.capabilityId}"`,
      );
    }

    const targetAccount = accountScopeKey(access.provider, access.accountId);
    const allowedAccounts = grant.constraints.accounts ?? [];
    if (allowedAccounts.length > 0 && !allowedAccounts.includes(targetAccount)) {
      throw new CredentialAccessError(
        'OPERATION_NOT_PERMITTED',
        `Account "${targetAccount}" is outside capability scope [${allowedAccounts.join(', ')}]`,
      );
    }

    const secret = await this.secretStore.getSecret(
      access.provider,
      access.secretKind,
      access.accountId,
    );
    if (secret === null) {
      throw new CredentialAccessError(
        'SECRET_NOT_FOUND',
        `No ${access.secretKind} stored for ${targetAccount}`,
      );
    }

    return secret;
  }

  private issueLocalGrant(
    params: IssueCredentialAccessParams,
    targetAccount: string,
    operation: string,
  ): CapabilityGrantV1 {
    const nowMs = this.clock();
    const issuedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + (params.ttlMs ?? this.defaultGrantTtlMs)).toISOString();

    return {
      schemaVersion: 1,
      capabilityId: `cap-credential-${randomUUID()}`,
      principalId: params.principalId,
      deviceId: this.localDeviceId,
      processId: this.localProcessId,
      sessionId: params.sessionId,
      processType: 'gateway',
      extensionInstanceId: null,
      workflowId: params.workflowId ?? 'wf-connector-credential',
      consentReceiptId: null,
      executionDestination: 'gateway',
      resource: 'gateway',
      operations: [operation],
      purpose: params.purpose,
      constraints: {
        accounts: [targetAccount],
      },
      issuedAt,
      expiresAt,
      policyEpoch: 1,
      revocationEpoch: 0,
      auditCorrelationId: `audit-credential-${randomUUID()}`,
      signature: 'local-process:connector-credential-read',
    };
  }
}

export function createCapabilityScopedCredentialService(
  config: CapabilityScopedCredentialConfig,
): CapabilityScopedCredentialService {
  return new CapabilityScopedCredentialService(config);
}
