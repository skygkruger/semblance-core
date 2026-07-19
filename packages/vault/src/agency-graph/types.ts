import { z } from 'zod';
import { IsoDateTime } from '@semblance/protocol';

export const AgencyEntityType = z.enum([
  'person',
  'document',
  'commitment',
  'preference',
  'action',
  'outcome',
]);
export type AgencyEntityType = z.infer<typeof AgencyEntityType>;

export const AgencyGraphEntityV1 = z
  .object({
    schemaVersion: z.literal(1),
    entityId: z.string().min(1),
    entityType: AgencyEntityType,
    label: z.string().min(1),
    occurredAt: IsoDateTime,
    sourceEventId: z.string().min(1),
    properties: z.record(z.unknown()),
    active: z.boolean(),
  })
  .strict();
export type AgencyGraphEntityV1 = z.infer<typeof AgencyGraphEntityV1>;

export const AgencyGraphEdgeV1 = z
  .object({
    schemaVersion: z.literal(1),
    edgeId: z.string().min(1),
    sourceEntityId: z.string().min(1),
    targetEntityId: z.string().min(1),
    relation: z.string().min(1),
    weight: z.number().min(0).max(1),
    occurredAt: IsoDateTime,
    sourceEventId: z.string().min(1),
    active: z.boolean(),
  })
  .strict();
export type AgencyGraphEdgeV1 = z.infer<typeof AgencyGraphEdgeV1>;

export const AgencyGraphSnapshotV1 = z
  .object({
    schemaVersion: z.literal(1),
    entities: z.array(AgencyGraphEntityV1),
    edges: z.array(AgencyGraphEdgeV1),
    snapshotHash: z.string().min(1),
    entityCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    builtFromEventCount: z.number().int().nonnegative(),
  })
  .strict();
export type AgencyGraphSnapshotV1 = z.infer<typeof AgencyGraphSnapshotV1>;

export interface DecryptedVaultEvent {
  sequence: number;
  eventId: string;
  eventType: string;
  occurredAt: string;
  sourceRefs: Array<{
    schemaVersion: 1;
    sourceId: string;
    sourceType: string;
    uri: string;
    ingestedAt: string;
  }>;
  sensitivity: string;
  payload: unknown;
}
