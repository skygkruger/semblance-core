import { describe, expect, it } from 'vitest';
import type { CapabilityGrantV1, VaultReadQueryV1 } from '@semblance/protocol';
import { buildVaultChatContext } from '@semblance/core/agent/context/vault-context-builder.js';
import { createVaultCapabilityClient, VaultCapabilityError } from '@semblance/vault/src/index.js';

const NOW_MS = Date.parse('2026-07-18T12:02:00.000Z');

function createDocumentsGrant(limit: number): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-context-test',
    principalId: 'principal-context-test',
    deviceId: 'device-context-test',
    processId: 'core-context-test',
    sessionId: 'session-context-test',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-context',
    consentReceiptId: null,
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read'],
    purpose: 'Vault context builder test',
    dataScope: {
      domains: ['documents'],
      accounts: [],
      sources: ['local'],
      recordClasses: ['document'],
    },
    constraints: {
      domains: ['documents'],
      resultLimit: limit,
      sensitivityCeiling: 'personal',
    },
    issuedAt: '2026-07-18T12:00:00.000Z',
    expiresAt: '2026-07-18T12:05:00.000Z',
    policyEpoch: 1,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-vault-context-test',
    signature: 'local-process:test',
  };
}

describe('buildVaultChatContext', () => {
  it('returns only authorized sources after capability-guarded search', () => {
    const grant = createDocumentsGrant(5);
    const client = createVaultCapabilityClient({ grant, clock: () => NOW_MS });

    const allChunks = [
      { sourceId: 'file:allowed-alpha', title: 'alpha budget', text: 'alpha budget' },
      { sourceId: 'file:allowed-bravo', title: 'bravo notes', text: 'bravo notes' },
      { sourceId: 'file:secret-charlie', title: 'charlie finance', text: 'charlie finance' },
    ];

    const result = buildVaultChatContext({
      authorizer: client,
      query: 'budget',
      limit: 2,
      searchDocuments: (query) =>
        allChunks.filter((chunk) => chunk.title.toLowerCase().includes(query.toLowerCase())),
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]?.sourceId).toBe('file:allowed-alpha');
    expect(result.authorizedSourceIds.has('file:allowed-alpha')).toBe(true);
    expect(result.authorizedSourceIds.has('file:secret-charlie')).toBe(false);
  });

  it('rejects reads when grant domain does not cover documents', () => {
    const grant = createDocumentsGrant(5);
    const financeOnlyGrant: CapabilityGrantV1 = {
      ...grant,
      dataScope: { ...grant.dataScope!, domains: ['finance'] },
      constraints: { ...grant.constraints, domains: ['finance'] },
    };
    const client = createVaultCapabilityClient({ grant: financeOnlyGrant, clock: () => NOW_MS });

    expect(() =>
      buildVaultChatContext({
        authorizer: client,
        query: 'budget',
        limit: 3,
        searchDocuments: () => [],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'WRONG_DATA_DOMAIN',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('authorizes document_search query shape before search executes', () => {
    const grant = createDocumentsGrant(3);
    const authorizedQueries: VaultReadQueryV1[] = [];
    const authorizer = {
      authorizeRead(query: VaultReadQueryV1): void {
        authorizedQueries.push(query);
        createVaultCapabilityClient({ grant, clock: () => NOW_MS }).authorizeRead(query);
      },
    };

    buildVaultChatContext({
      authorizer,
      query: 'meeting notes',
      limit: 3,
      searchDocuments: () => [],
    });

    expect(authorizedQueries).toEqual([
      { kind: 'document_search', text: 'meeting notes', limit: 3 },
    ]);
  });
});
