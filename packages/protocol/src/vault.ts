import { z } from 'zod';
import { CapabilityGrantV1 } from './capability.js';
import { IsoDateTime, SchemaVersion, SensitivityLevel } from './common.js';

export const SourceRefV1 = z
  .object({
    schemaVersion: SchemaVersion,
    sourceId: z.string().min(1),
    sourceType: z.string().min(1),
    uri: z.string().min(1),
    ingestedAt: IsoDateTime,
  })
  .strict();
export type SourceRefV1 = z.infer<typeof SourceRefV1>;

export const VaultEventType = z.enum([
  'source_ingested',
  'assertion_proposed',
  'assertion_confirmed',
  'corrected',
  'action_result',
  'outcome_recorded',
  'deleted',
]);
export type VaultEventType = z.infer<typeof VaultEventType>;

export const VaultEventV1 = z
  .object({
    schemaVersion: SchemaVersion,
    eventId: z.string().min(1),
    deviceId: z.string().min(1),
    membershipEpoch: z.number().int().nonnegative(),
    eventType: VaultEventType,
    sourceRefs: z.array(SourceRefV1),
    sensitivity: SensitivityLevel,
    occurredAt: IsoDateTime,
    payloadCiphertext: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
export type VaultEventV1 = z.infer<typeof VaultEventV1>;

export const AuthenticatedCallV1 = z
  .object({
    requestId: z.string().min(1),
    processId: z.string().min(1),
    sessionId: z.string().min(1),
    nonce: z.string().min(1),
    requestedAt: IsoDateTime,
    bodyHash: z.string().min(1),
    callerSignature: z.string().min(1),
  })
  .strict();
export type AuthenticatedCallV1 = z.infer<typeof AuthenticatedCallV1>;

export const AgencyGraphPatternV1 = z
  .object({
    entityId: z.string().optional(),
    relation: z.string().optional(),
    depth: z.number().int().positive().optional(),
  })
  .strict();
export type AgencyGraphPatternV1 = z.infer<typeof AgencyGraphPatternV1>;

export const VaultReadQueryV1 = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('document_search'),
      text: z.string(),
      limit: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('records'),
      domain: z.string(),
      filter: z.record(z.unknown()),
      limit: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('agency_graph'),
      pattern: AgencyGraphPatternV1,
      limit: z.number().int().positive(),
    })
    .strict(),
]);
export type VaultReadQueryV1 = z.infer<typeof VaultReadQueryV1>;

export const VaultReadRequestV1 = z
  .object({
    auth: AuthenticatedCallV1,
    capability: CapabilityGrantV1,
    query: VaultReadQueryV1,
  })
  .strict();
export type VaultReadRequestV1 = z.infer<typeof VaultReadRequestV1>;

export const VaultWriteRequestV1 = z
  .object({
    auth: AuthenticatedCallV1,
    capability: CapabilityGrantV1,
    event: VaultEventV1,
  })
  .strict();
export type VaultWriteRequestV1 = z.infer<typeof VaultWriteRequestV1>;

export const VAULT_EVENT_V1_SCHEMA_ID = 'vault-event-v1';
