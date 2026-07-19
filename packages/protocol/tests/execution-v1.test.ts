import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_COMPATIBLE_WITH,
  EXECUTION_PROTOCOL_VERSION,
  EXECUTION_V1_SCHEMA_IDS,
  ExecutionHandshakeAuthV1,
  ExecutionHandshakeChallengeV1,
  ExecutionHandshakeHelloV1,
  ExecutionHandshakeSessionV1,
  ExecutionHealthV1,
  ExecutionIdempotencyKeyV1,
  ExecutionModelInventoryV1,
  ExecutionReceiptV1,
  ExecutionRevocationV1,
  ExecutionTaskEnvelopeV1,
  assertSchemaCompatible,
  assertSchemaIncompatible,
  loadProtocolSchema,
  schemaCompatibility,
  validateProtocolDocument,
  type ExecutionV1SchemaId,
} from '../src/index.js';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(packageRoot, '..', 'fixtures', 'cross-repo');

function loadFixture<T>(name: string): T {
  const raw = readFileSync(join(fixturesDir, name), 'utf8');
  return JSON.parse(raw) as T;
}

const fixtureBySchemaId: Record<ExecutionV1SchemaId, string> = {
  'execution-handshake-hello-v1': 'execution-handshake-hello-v1.json',
  'execution-handshake-challenge-v1': 'execution-handshake-challenge-v1.json',
  'execution-handshake-auth-v1': 'execution-handshake-auth-v1.json',
  'execution-handshake-session-v1': 'execution-handshake-session-v1.json',
  'execution-model-inventory-v1': 'execution-model-inventory-v1.json',
  'execution-idempotency-key-v1': 'execution-idempotency-key-v1.json',
  'execution-task-envelope-v1': 'execution-task-envelope-v1.json',
  'execution-receipt-v1': 'execution-receipt-v1.json',
  'execution-health-v1': 'execution-health-v1.json',
  'execution-revocation-v1': 'execution-revocation-v1.json',
};

describe('execution/v1 protocol version markers', () => {
  it('declares execution/v1 as canonical version', () => {
    expect(EXECUTION_PROTOCOL_VERSION).toBe('execution/v1');
  });

  it('marks execution/v1 as previous-compatible with itself', () => {
    expect(EXECUTION_COMPATIBLE_WITH).toEqual(['execution/v1']);
  });
});

describe('execution/v1 JSON Schema registry', () => {
  it.each(EXECUTION_V1_SCHEMA_IDS)('loads JSON Schema for %s', (schemaId) => {
    const schema = loadProtocolSchema(schemaId);
    expect(schema.$id).toContain(schemaId);
  });

  it.each(EXECUTION_V1_SCHEMA_IDS)('validates cross-repo fixture for %s', (schemaId) => {
    const fixture = loadFixture(fixtureBySchemaId[schemaId]);
    const result = validateProtocolDocument(schemaId, fixture);
    expect(result.compatible, result.reason).toBe(true);
  });
});

describe('execution/v1 schema compatibility', () => {
  it('accepts optional ExecutionModelInventoryV1 model contentHash', () => {
    const baseline = loadFixture<Record<string, unknown>>('execution-model-inventory-v1.json');
    const withExtraModelField = {
      ...baseline,
      models: [
        {
          ...(baseline.models as Array<Record<string, unknown>>)[0],
          contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
      ],
    };

    const result = schemaCompatibility(
      'execution-model-inventory-v1',
      baseline,
      withExtraModelField,
    );
    expect(result.compatible).toBe(true);
  });

  it('rejects removal of ExecutionTaskEnvelopeV1.idempotencyKey', () => {
    const baseline = loadFixture<Record<string, unknown>>('execution-task-envelope-v1.json');
    const removed = { ...baseline };
    delete removed.idempotencyKey;

    expect(() =>
      assertSchemaIncompatible('execution-task-envelope-v1', baseline, removed),
    ).not.toThrow();
  });

  it('rejects removal of ExecutionHealthV1.compatibleWith', () => {
    const baseline = loadFixture<Record<string, unknown>>('execution-health-v1.json');
    const removed = { ...baseline };
    delete removed.compatibleWith;

    const result = schemaCompatibility('execution-health-v1', baseline, removed);
    expect(result.compatible).toBe(false);
  });

  it('accepts compatible ExecutionHandshakeSessionV1 with same required fields', () => {
    const baseline = loadFixture<Record<string, unknown>>('execution-handshake-session-v1.json');
    const candidate = {
      ...baseline,
      sessionId: 'session-002',
    };

    expect(() =>
      assertSchemaCompatible('execution-handshake-session-v1', baseline, candidate),
    ).not.toThrow();
  });
});

describe('execution/v1 zod parity', () => {
  it('parses ExecutionHandshakeHelloV1 fixture', () => {
    const fixture = loadFixture('execution-handshake-hello-v1.json');
    expect(ExecutionHandshakeHelloV1.parse(fixture)).toMatchObject({
      protocolVersion: 'execution/v1',
    });
  });

  it('parses ExecutionHandshakeChallengeV1 fixture with compatibleWith', () => {
    const fixture = loadFixture('execution-handshake-challenge-v1.json');
    expect(ExecutionHandshakeChallengeV1.parse(fixture)).toMatchObject({
      compatibleWith: ['execution/v1'],
    });
  });

  it('parses ExecutionHandshakeAuthV1 fixture', () => {
    const fixture = loadFixture('execution-handshake-auth-v1.json');
    expect(ExecutionHandshakeAuthV1.parse(fixture)).toMatchObject({
      nodeId: 'self-host-node-001',
    });
  });

  it('parses ExecutionHandshakeSessionV1 fixture', () => {
    const fixture = loadFixture('execution-handshake-session-v1.json');
    expect(ExecutionHandshakeSessionV1.parse(fixture)).toMatchObject({
      sessionId: 'session-001',
    });
  });

  it('parses ExecutionModelInventoryV1 fixture', () => {
    const fixture = loadFixture('execution-model-inventory-v1.json');
    expect(ExecutionModelInventoryV1.parse(fixture).models).toHaveLength(1);
  });

  it('parses ExecutionIdempotencyKeyV1 fixture', () => {
    const fixture = loadFixture('execution-idempotency-key-v1.json');
    expect(ExecutionIdempotencyKeyV1.parse(fixture)).toMatchObject({ scope: 'task' });
  });

  it('parses ExecutionTaskEnvelopeV1 fixture', () => {
    const fixture = loadFixture('execution-task-envelope-v1.json');
    expect(ExecutionTaskEnvelopeV1.parse(fixture)).toMatchObject({ taskId: 'task-001' });
  });

  it('parses ExecutionReceiptV1 fixture', () => {
    const fixture = loadFixture('execution-receipt-v1.json');
    expect(ExecutionReceiptV1.parse(fixture)).toMatchObject({ receiptId: 'receipt-001' });
  });

  it('parses ExecutionHealthV1 fixture', () => {
    const fixture = loadFixture('execution-health-v1.json');
    expect(ExecutionHealthV1.parse(fixture)).toMatchObject({ status: 'healthy' });
  });

  it('parses ExecutionRevocationV1 fixture', () => {
    const fixture = loadFixture('execution-revocation-v1.json');
    expect(ExecutionRevocationV1.parse(fixture)).toMatchObject({ targetType: 'session' });
  });

  it('rejects invalid ExecutionHealthV1 status in both JSON Schema and Zod', () => {
    const fixture = loadFixture<Record<string, unknown>>('execution-health-v1.json');
    const invalid = { ...fixture, status: 'offline' };

    const jsonResult = validateProtocolDocument('execution-health-v1', invalid);
    expect(jsonResult.compatible).toBe(false);
    expect(() => ExecutionHealthV1.parse(invalid)).toThrow();
  });
});
