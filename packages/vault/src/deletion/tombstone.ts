import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { SensitivityLevel, SourceRefV1, VaultEventType } from '@semblance/protocol';
import { REDACTED_PAYLOAD_CIPHERTEXT } from '../crypto/domain-keys.js';
import { DeletedPayloadV1 } from '../projections/agency-graph.js';

export { REDACTED_PAYLOAD_CIPHERTEXT };

export const DeletionTombstonePayloadV1 = DeletedPayloadV1.extend({
  recordReference: z.string().min(32),
  dataDomain: z.string().min(1),
  scope: z.enum(['content', 'entity', 'domain']),
  policyEpoch: z.number().int().nonnegative(),
  sourceEventId: z.string().min(1).optional(),
}).strict();
export type DeletionTombstonePayloadV1 = z.infer<typeof DeletionTombstonePayloadV1>;

export interface DeletionTombstoneAppendInput {
  eventId: string;
  dataDomain: string;
  deviceId: string;
  membershipEpoch: number;
  eventType: VaultEventType;
  sourceRefs: SourceRefV1[];
  sensitivity: SensitivityLevel;
  occurredAt: string;
  payloadPlaintext: string;
  tombstone: DeletionTombstonePayloadV1;
  recordReference: string;
  deletionReceiptHash: string;
}

export interface CreateDeletionTombstoneOptions {
  eventId: string;
  entityId: string;
  entityType: DeletionTombstonePayloadV1['entityType'];
  dataDomain: string;
  deviceId: string;
  membershipEpoch: number;
  policyEpoch: number;
  sourceRefs: SourceRefV1[];
  sensitivity: SensitivityLevel;
  occurredAt: string;
  sourceEventId?: string;
  scope?: DeletionTombstonePayloadV1['scope'];
}

export function generateDeletionRecordReference(): string {
  return randomBytes(32).toString('hex');
}

export function computeDeletionReceiptHash(params: {
  eventId: string;
  recordReference: string;
  dataDomain: string;
  entityId: string;
}): string {
  const canonical = JSON.stringify({
    eventId: params.eventId,
    recordReference: params.recordReference,
    dataDomain: params.dataDomain,
    entityId: params.entityId,
  });
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

export function createDeletionTombstoneInput(
  options: CreateDeletionTombstoneOptions,
): DeletionTombstoneAppendInput {
  const recordReference = generateDeletionRecordReference();
  const tombstone: DeletionTombstonePayloadV1 = {
    schemaVersion: 1,
    entityId: options.entityId,
    entityType: options.entityType,
    recordReference,
    dataDomain: options.dataDomain,
    scope: options.scope ?? 'content',
    policyEpoch: options.policyEpoch,
    sourceEventId: options.sourceEventId,
  };

  const deletionReceiptHash = computeDeletionReceiptHash({
    eventId: options.eventId,
    recordReference,
    dataDomain: options.dataDomain,
    entityId: options.entityId,
  });

  return {
    eventId: options.eventId,
    dataDomain: options.dataDomain,
    deviceId: options.deviceId,
    membershipEpoch: options.membershipEpoch,
    eventType: 'deleted',
    sourceRefs: options.sourceRefs,
    sensitivity: options.sensitivity,
    occurredAt: options.occurredAt,
    payloadPlaintext: JSON.stringify(tombstone),
    tombstone,
    recordReference,
    deletionReceiptHash,
  };
}

export function parseDeletionTombstonePayload(payload: unknown): DeletionTombstonePayloadV1 {
  return DeletionTombstonePayloadV1.parse(payload);
}
