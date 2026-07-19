import type { CapabilityGrantV1 } from '@semblance/protocol';

export type ConnectorCredentialKind = 'access_token' | 'refresh_token';

export interface CredentialAccessGrant {
  grant: CapabilityGrantV1;
  provider: string;
  accountId?: string;
  secretKind: ConnectorCredentialKind;
}

export interface IssueCredentialAccessParams {
  sessionId: string;
  principalId: string;
  provider: string;
  accountId?: string;
  secretKind: ConnectorCredentialKind;
  purpose: string;
  workflowId?: string;
  ttlMs?: number;
}

export interface CredentialAccessBackend {
  issueCredentialAccess(params: IssueCredentialAccessParams): Promise<CredentialAccessGrant>;
  redeemCredentialAccess(
    access: CredentialAccessGrant,
    callerPrincipalId: string,
    nowMs?: number,
  ): Promise<string>;
}

export interface CredentialCapabilityClient {
  getAccessToken(provider: string, accountId?: string, purpose?: string): Promise<string | null>;
  getRefreshToken(provider: string, accountId?: string, purpose?: string): Promise<string | null>;
}

export interface CredentialCapabilityClientConfig {
  backend: CredentialAccessBackend;
  principalId: string;
  sessionId: string;
  defaultPurpose?: string;
  clock?: () => number;
}

export function createCredentialCapabilityClient(
  config: CredentialCapabilityClientConfig,
): CredentialCapabilityClient {
  const fetchSecret = async (
    provider: string,
    secretKind: ConnectorCredentialKind,
    accountId?: string,
    purpose?: string,
  ): Promise<string | null> => {
    try {
      const access = await config.backend.issueCredentialAccess({
        sessionId: config.sessionId,
        principalId: config.principalId,
        provider,
        accountId,
        secretKind,
        purpose: purpose ?? config.defaultPurpose ?? 'Gateway connector operation',
      });
      return await config.backend.redeemCredentialAccess(
        access,
        config.principalId,
        config.clock?.(),
      );
    } catch (err) {
      console.error('[CredentialCapabilityClient] Failed to obtain credential:', err);
      return null;
    }
  };

  return {
    getAccessToken(provider, accountId, purpose) {
      return fetchSecret(provider, 'access_token', accountId, purpose);
    },
    getRefreshToken(provider, accountId, purpose) {
      return fetchSecret(provider, 'refresh_token', accountId, purpose);
    },
  };
}
