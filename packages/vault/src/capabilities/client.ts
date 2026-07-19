import type { CapabilityGrantV1, VaultEventType, VaultReadQueryV1 } from '@semblance/protocol';
import { VaultEventType as VaultEventTypeSchema } from '@semblance/protocol';
import { assertVaultCapability } from './guard.js';

export interface VaultCapabilityClient {
  authorizeRead(query: VaultReadQueryV1): void;
  authorizeWrite(eventType: VaultEventType): void;
}

export interface VaultCapabilityClientOptions {
  grant: CapabilityGrantV1;
  clock?: () => number;
}

function readQueryToContext(
  grant: CapabilityGrantV1,
  query: VaultReadQueryV1,
  nowMs: number,
): {
  principalId: string;
  dataDomain: string;
  sensitivity: 'public';
  resultLimit: number;
  nowMs: number;
} {
  switch (query.kind) {
    case 'document_search':
      return {
        principalId: grant.principalId,
        dataDomain: 'documents',
        sensitivity: 'public',
        resultLimit: query.limit,
        nowMs,
      };
    case 'records':
      return {
        principalId: grant.principalId,
        dataDomain: query.domain,
        sensitivity: 'public',
        resultLimit: query.limit,
        nowMs,
      };
    case 'agency_graph':
      return {
        principalId: grant.principalId,
        dataDomain: 'agency_graph',
        sensitivity: 'public',
        resultLimit: query.limit,
        nowMs,
      };
  }
}

function writeEventToContext(
  grant: CapabilityGrantV1,
  nowMs: number,
): {
  principalId: string;
  dataDomain: string;
  sensitivity: 'public';
  resultLimit: number;
  nowMs: number;
} {
  const allowedDomain =
    grant.dataScope?.domains[0] ?? grant.constraints.domains?.[0] ?? 'vault';

  return {
    principalId: grant.principalId,
    dataDomain: allowedDomain,
    sensitivity: 'public',
    resultLimit: 1,
    nowMs,
  };
}

export function createVaultCapabilityClient(
  options: VaultCapabilityClientOptions,
): VaultCapabilityClient {
  const clock = options.clock ?? (() => Date.now());
  const grant = options.grant;

  return {
    authorizeRead(query: VaultReadQueryV1): void {
      assertVaultCapability(
        grant,
        'vault.read',
        readQueryToContext(grant, query, clock()),
      );
    },

    authorizeWrite(eventType: VaultEventType): void {
      VaultEventTypeSchema.parse(eventType);
      assertVaultCapability(
        grant,
        'vault.write',
        writeEventToContext(grant, clock()),
      );
    },
  };
}
