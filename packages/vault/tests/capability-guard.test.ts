import { describe, expect, it } from 'vitest';
import type { CapabilityGrantV1 } from '@semblance/protocol';
import {
  assertVaultCapability,
  createVaultCapabilityClient,
  VaultCapabilityError,
  type VaultCapabilityGuardContext,
} from '../src/index.js';

const NOW_MS = Date.parse('2026-07-18T12:02:00.000Z');

function createVaultGrant(overrides: Partial<CapabilityGrantV1> = {}): CapabilityGrantV1 {
  return {
    schemaVersion: 1,
    capabilityId: 'cap-vault-001',
    principalId: 'principal-local-001',
    deviceId: 'device-macbook-001',
    processId: 'core-01HXYZ',
    sessionId: 'session-9b2c4d6e8f0a',
    processType: 'core',
    extensionInstanceId: null,
    workflowId: 'wf-vault-read',
    consentReceiptId: 'receipt-consent-001',
    executionDestination: 'local',
    resource: 'vault',
    operations: ['vault.read', 'vault.write'],
    purpose: 'Read vault records for triage',
    dataScope: {
      domains: ['email', 'documents'],
      accounts: ['user@example.com'],
      sources: ['gmail'],
      recordClasses: ['message'],
    },
    constraints: {
      domains: ['email', 'documents'],
      resultLimit: 50,
      sensitivityCeiling: 'personal',
    },
    issuedAt: '2026-07-18T12:00:00.000Z',
    expiresAt: '2026-07-18T12:05:00.000Z',
    policyEpoch: 3,
    revocationEpoch: 0,
    auditCorrelationId: 'audit-cap-vault-001',
    signature: 'ed25519:capability-signature-base64',
    ...overrides,
  };
}

function validContext(
  overrides: Partial<VaultCapabilityGuardContext> = {},
): VaultCapabilityGuardContext {
  return {
    principalId: 'principal-local-001',
    dataDomain: 'email',
    sensitivity: 'personal',
    resultLimit: 25,
    nowMs: NOW_MS,
    ...overrides,
  };
}

describe('assertVaultCapability', () => {
  it('rejects wrong principal', () => {
    const grant = createVaultGrant();

    expect(() =>
      assertVaultCapability(grant, 'vault.read', validContext({ principalId: 'principal-other' })),
    ).toThrowError(
      expect.objectContaining({
        code: 'WRONG_PRINCIPAL',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('rejects expired grant', () => {
    const grant = createVaultGrant();

    expect(() =>
      assertVaultCapability(
        grant,
        'vault.read',
        validContext({ nowMs: Date.parse('2026-07-18T12:06:00.000Z') }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: 'EXPIRED_GRANT',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('rejects excessive result limit', () => {
    const grant = createVaultGrant();

    expect(() =>
      assertVaultCapability(grant, 'vault.read', validContext({ resultLimit: 100 })),
    ).toThrowError(
      expect.objectContaining({
        code: 'EXCESSIVE_RESULT_LIMIT',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('rejects wrong data domain', () => {
    const grant = createVaultGrant();

    expect(() =>
      assertVaultCapability(grant, 'vault.read', validContext({ dataDomain: 'finance' })),
    ).toThrowError(
      expect.objectContaining({
        code: 'WRONG_DATA_DOMAIN',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('rejects sensitivity above ceiling', () => {
    const grant = createVaultGrant();

    expect(() =>
      assertVaultCapability(grant, 'vault.read', validContext({ sensitivity: 'restricted' })),
    ).toThrowError(
      expect.objectContaining({
        code: 'SENSITIVITY_CEILING',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('rejects operation not permitted', () => {
    const grant = createVaultGrant({ operations: ['vault.read'] });

    expect(() => assertVaultCapability(grant, 'vault.write', validContext())).toThrowError(
      expect.objectContaining({
        code: 'OPERATION_NOT_PERMITTED',
      } satisfies Partial<VaultCapabilityError>),
    );
  });

  it('allows a valid read when all constraints pass', () => {
    const grant = createVaultGrant();

    expect(() => assertVaultCapability(grant, 'vault.read', validContext())).not.toThrow();
  });
});

describe('createVaultCapabilityClient', () => {
  it('authorizes read and write through typed methods without exposing raw stores', () => {
    const grant = createVaultGrant();
    const client = createVaultCapabilityClient({ grant, clock: () => NOW_MS });

    expect(() =>
      client.authorizeRead({
        kind: 'records',
        domain: 'email',
        filter: { folder: 'INBOX' },
        limit: 25,
      }),
    ).not.toThrow();

    expect(() => client.authorizeWrite('source_ingested')).not.toThrow();

    expect(client).not.toHaveProperty('getDb');
    expect(client).not.toHaveProperty('getGraph');
    expect(client).not.toHaveProperty('getSearchEngine');
    expect(client).not.toHaveProperty('getFilesystemPath');
  });
});
