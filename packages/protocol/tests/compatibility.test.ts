import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ActionRequest,
  ActionRequestV1,
  ActionResponse,
  ActionResponseV1,
  CapabilityGrantV1,
  ExtensionManifestV1,
  ProcessAckV1,
  ProcessHelloV1,
  ProofReceiptV1,
  PROTOCOL_SCHEMA_IDS,
  SignedEntitlementV1,
  SyncEnvelopeV1,
  VaultEventV1,
  assertSchemaIncompatible,
  loadProtocolSchema,
  schemaCompatibility,
  validateProtocolDocument,
  type ProtocolSchemaId,
} from '../src/index.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(packageRoot, '..', 'fixtures', 'cross-repo');

function loadFixture<T>(name: string): T {
  const raw = readFileSync(join(fixturesDir, name), 'utf8');
  return JSON.parse(raw) as T;
}

const fixtureBySchemaId: Record<ProtocolSchemaId, string> = {
  'process-hello-v1': 'process-hello-v1.json',
  'process-ack-v1': 'process-ack-v1.json',
  'capability-grant-v1': 'capability-grant-v1.json',
  'action-request-v1': 'action-request-v1.json',
  'action-response-v1': 'action-response-v1.json',
  'signed-entitlement-v1': 'signed-entitlement-v1.json',
  'extension-manifest-v1': 'extension-manifest-v1.json',
  'proof-receipt-v1': 'proof-receipt-v1.json',
  'vault-event-v1': 'vault-event-v1.json',
  'sync-envelope-v1': 'sync-envelope-v1.json',
};

describe('@semblance/protocol compatibility', () => {
  it.each(PROTOCOL_SCHEMA_IDS)('loads JSON Schema for %s', (schemaId) => {
    const schema = loadProtocolSchema(schemaId);
    expect(schema.$id).toContain(schemaId);
  });

  it.each(PROTOCOL_SCHEMA_IDS)('validates cross-repo fixture for %s', (schemaId) => {
    const fixture = loadFixture(fixtureBySchemaId[schemaId]);
    const result = validateProtocolDocument(schemaId, fixture);
    expect(result.compatible, result.reason).toBe(true);
  });

  it('rejects unversioned breaking removal of ProcessHelloV1.processType', () => {
    const previousFixture = loadFixture<Record<string, unknown>>('process-hello-v1.json');
    const removedField = { ...previousFixture };
    delete removedField.processType;

    expect(() =>
      assertSchemaIncompatible('process-hello-v1', previousFixture, removedField),
    ).not.toThrow();

    const result = schemaCompatibility('process-hello-v1', previousFixture, removedField);
    expect(result.compatible).toBe(false);
  });

  it('rejects removal of ActionRequestV1.signature', () => {
    const previousFixture = loadFixture<Record<string, unknown>>('action-request-v1.json');
    const removedField = { ...previousFixture };
    delete removedField.signature;

    const result = schemaCompatibility('action-request-v1', previousFixture, removedField);
    expect(result.compatible).toBe(false);
  });

  it('accepts optional ActionResponseV1.data on top of required fields', () => {
    const previousFixture = loadFixture<Record<string, unknown>>('action-response-v1.json');
    const withExtra = {
      ...previousFixture,
      remoteDeviceId: 'device-phone-001',
    };

    const result = schemaCompatibility('action-response-v1', previousFixture, withExtra);
    expect(result.compatible).toBe(true);
  });
});

describe('@semblance/protocol zod parity', () => {
  it('parses ProcessHelloV1 fixture', () => {
    const fixture = loadFixture('process-hello-v1.json');
    expect(ProcessHelloV1.parse(fixture)).toMatchObject({ protocolVersion: 1 });
  });

  it('parses ProcessAckV1 fixture', () => {
    const fixture = loadFixture('process-ack-v1.json');
    expect(ProcessAckV1.parse(fixture)).toMatchObject({ policyEpoch: 3 });
  });

  it('parses CapabilityGrantV1 fixture', () => {
    const fixture = loadFixture('capability-grant-v1.json');
    expect(CapabilityGrantV1.parse(fixture)).toMatchObject({ resource: 'gateway' });
  });

  it('wraps legacy ActionRequest fields in ActionRequestV1', () => {
    const base = ActionRequest.parse({
      id: 'req-1',
      timestamp: '2026-07-18T12:00:00.000Z',
      action: 'email.fetch',
      payload: { folder: 'INBOX' },
      source: 'core',
      signature: 'sig',
    });
    const wrapped = ActionRequestV1.parse({ protocolVersion: 1, ...base });
    expect(wrapped.protocolVersion).toBe(1);
    expect(wrapped.id).toBe('req-1');
  });

  it('wraps legacy ActionResponse fields in ActionResponseV1', () => {
    const base = ActionResponse.parse({
      requestId: 'req-1',
      timestamp: '2026-07-18T12:00:01.000Z',
      status: 'success',
      auditRef: 'audit-1',
    });
    const wrapped = ActionResponseV1.parse({ protocolVersion: 1, ...base });
    expect(wrapped.protocolVersion).toBe(1);
    expect(wrapped.status).toBe('success');
  });

  it('parses SignedEntitlementV1 fixture', () => {
    const fixture = loadFixture('signed-entitlement-v1.json');
    expect(SignedEntitlementV1.parse(fixture)).toMatchObject({ tier: 'digital-representative' });
  });

  it('parses ExtensionManifestV1 fixture', () => {
    const fixture = loadFixture('extension-manifest-v1.json');
    expect(ExtensionManifestV1.parse(fixture)).toMatchObject({ id: 'com.semblance.dr' });
  });

  it('parses ProofReceiptV1 fixture', () => {
    const fixture = loadFixture('proof-receipt-v1.json');
    expect(ProofReceiptV1.parse(fixture)).toMatchObject({ receiptType: 'action' });
  });

  it('parses VaultEventV1 fixture', () => {
    const fixture = loadFixture('vault-event-v1.json');
    expect(VaultEventV1.parse(fixture)).toMatchObject({ eventType: 'source_ingested' });
  });

  it('parses SyncEnvelopeV1 fixture', () => {
    const fixture = loadFixture('sync-envelope-v1.json');
    expect(SyncEnvelopeV1.parse(fixture)).toMatchObject({ envelopeKind: 'encrypted_event' });
  });
});
