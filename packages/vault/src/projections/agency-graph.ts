import { z } from 'zod';
import { parseAssertion, type VaultAssertionV1 } from '../provenance/assertion.js';
import type {
  AgencyEntityType,
  AgencyGraphEdgeV1,
  AgencyGraphEntityV1,
  DecryptedVaultEvent,
} from '../agency-graph/types.js';
import { DocumentProjectionPayloadV1 } from './documents.js';

export const ActionResultPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    actionId: z.string().min(1),
    actionType: z.string().min(1),
    label: z.string().min(1),
    targetEntityId: z.string().min(1).optional(),
    status: z.enum(['success', 'error', 'pending']),
    estimatedTimeSavedSeconds: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ActionResultPayloadV1 = z.infer<typeof ActionResultPayloadV1>;

export const OutcomeRecordedPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    outcomeId: z.string().min(1),
    actionId: z.string().min(1),
    label: z.string().min(1),
    success: z.boolean(),
  })
  .strict();
export type OutcomeRecordedPayloadV1 = z.infer<typeof OutcomeRecordedPayloadV1>;

export const DeletedPayloadV1 = z
  .object({
    schemaVersion: z.literal(1),
    entityId: z.string().min(1),
    entityType: z.enum(['person', 'document', 'commitment', 'preference', 'action', 'outcome']),
  })
  .strict();
export type DeletedPayloadV1 = z.infer<typeof DeletedPayloadV1>;

export interface AgencyGraphProjectionDelta {
  entities: AgencyGraphEntityV1[];
  edges: AgencyGraphEdgeV1[];
}

const ASSERTION_EVENT_TYPES = new Set([
  'assertion_proposed',
  'assertion_confirmed',
  'corrected',
]);

function inferEntityTypeFromAssertion(assertion: VaultAssertionV1): AgencyEntityType {
  const predicate = assertion.predicate.toLowerCase();
  if (predicate.startsWith('person.') || predicate.startsWith('person/')) {
    return 'person';
  }
  if (predicate.startsWith('commitment.') || predicate.startsWith('commitment/')) {
    return 'commitment';
  }
  if (predicate.startsWith('preference.') || predicate.startsWith('preference/')) {
    return 'preference';
  }
  if (predicate.startsWith('document.') || predicate.startsWith('document/')) {
    return 'document';
  }
  if (predicate.startsWith('action.') || predicate.startsWith('action/')) {
    return 'action';
  }
  if (predicate.startsWith('outcome.') || predicate.startsWith('outcome/')) {
    return 'outcome';
  }
  return 'preference';
}

function entityLabel(entityType: AgencyEntityType, subject: string, object: string): string {
  if (object.length > 0 && object !== subject) {
    return object;
  }
  return `${entityType}:${subject}`;
}

function buildEntity(
  entityId: string,
  entityType: AgencyEntityType,
  label: string,
  event: DecryptedVaultEvent,
  properties: Record<string, unknown>,
  active = true,
): AgencyGraphEntityV1 {
  return {
    schemaVersion: 1,
    entityId,
    entityType,
    label,
    occurredAt: event.occurredAt,
    sourceEventId: event.eventId,
    properties,
    active,
  };
}

function buildEdge(
  edgeId: string,
  sourceEntityId: string,
  targetEntityId: string,
  relation: string,
  event: DecryptedVaultEvent,
  weight = 1,
  active = true,
): AgencyGraphEdgeV1 {
  return {
    schemaVersion: 1,
    edgeId,
    sourceEntityId,
    targetEntityId,
    relation,
    weight,
    occurredAt: event.occurredAt,
    sourceEventId: event.eventId,
    active,
  };
}

function projectSourceIngested(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  const parsed = DocumentProjectionPayloadV1.safeParse(event.payload);
  if (!parsed.success) {
    return { entities: [], edges: [] };
  }

  const payload = parsed.data;
  const entity = buildEntity(
    payload.documentId,
    'document',
    payload.title,
    event,
    {
      mimeType: payload.mimeType ?? null,
      sourcePath: payload.sourcePath ?? null,
      byteLength: payload.byteLength ?? null,
      sourceRefs: event.sourceRefs,
    },
  );

  const entities: AgencyGraphEntityV1[] = [entity];
  const edges: AgencyGraphEdgeV1[] = [];

  for (const personId of payload.relatedPersonIds ?? []) {
    entities.push(
      buildEntity(personId, 'person', personId, event, { inferredFrom: 'relatedPersonIds' }),
    );
    edges.push(
      buildEdge(
        `edge:${event.eventId}:${payload.documentId}->${personId}`,
        payload.documentId,
        personId,
        'mentions_person',
        event,
        0.8,
      ),
    );
  }

  return { entities, edges };
}

function projectAssertion(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  const payloadRecord =
    typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : null;
  if (!payloadRecord || !('assertion' in payloadRecord)) {
    return { entities: [], edges: [] };
  }

  const assertion = parseAssertion(payloadRecord.assertion);
  const entityType = inferEntityTypeFromAssertion(assertion);
  const entityId = assertion.subject;
  const entity = buildEntity(
    entityId,
    entityType,
    entityLabel(entityType, assertion.subject, assertion.object),
    event,
    {
      predicate: assertion.predicate,
      object: assertion.object,
      assertionId: assertion.assertionId,
      status: assertion.status,
      confidence: assertion.provenance.confidence,
      derivationMethod: assertion.provenance.derivationMethod,
      sensitivity: assertion.provenance.sensitivity,
    },
  );

  const edges: AgencyGraphEdgeV1[] = [];
  if (entityType === 'commitment' && assertion.object) {
    const personId = assertion.object;
    edges.push(
      buildEdge(
        `edge:${event.eventId}:${entityId}->${personId}`,
        entityId,
        personId,
        'commitment_involves',
        event,
        0.9,
      ),
    );
    const personEntity = buildEntity(personId, 'person', personId, event, {
      inferredFrom: 'commitment_object',
    });
    return { entities: [entity, personEntity], edges };
  }

  return { entities: [entity], edges };
}

function projectActionResult(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  const parsed = ActionResultPayloadV1.safeParse(event.payload);
  if (!parsed.success) {
    return { entities: [], edges: [] };
  }

  const payload = parsed.data;
  const entity = buildEntity(payload.actionId, 'action', payload.label, event, {
    actionType: payload.actionType,
    status: payload.status,
    estimatedTimeSavedSeconds: payload.estimatedTimeSavedSeconds ?? 0,
  });

  const edges: AgencyGraphEdgeV1[] = [];
  if (payload.targetEntityId) {
    edges.push(
      buildEdge(
        `edge:${event.eventId}:${payload.actionId}->${payload.targetEntityId}`,
        payload.actionId,
        payload.targetEntityId,
        'action_target',
        event,
        1,
      ),
    );
  }

  return { entities: [entity], edges };
}

function projectOutcomeRecorded(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  const parsed = OutcomeRecordedPayloadV1.safeParse(event.payload);
  if (!parsed.success) {
    return { entities: [], edges: [] };
  }

  const payload = parsed.data;
  const entity = buildEntity(payload.outcomeId, 'outcome', payload.label, event, {
    success: payload.success,
    actionId: payload.actionId,
  });

  const edges = [
    buildEdge(
      `edge:${event.eventId}:${payload.actionId}->${payload.outcomeId}`,
      payload.actionId,
      payload.outcomeId,
      'produced_outcome',
      event,
      payload.success ? 1 : 0.5,
    ),
  ];

  return { entities: [entity], edges };
}

function projectDeleted(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  const parsed = DeletedPayloadV1.safeParse(event.payload);
  if (!parsed.success) {
    return { entities: [], edges: [] };
  }

  const payload = parsed.data;
  const tombstone = buildEntity(
    payload.entityId,
    payload.entityType,
    `${payload.entityType}:${payload.entityId}`,
    event,
    { deleted: true },
    false,
  );

  return { entities: [tombstone], edges: [] };
}

function projectSingleEvent(event: DecryptedVaultEvent): AgencyGraphProjectionDelta {
  switch (event.eventType) {
    case 'source_ingested':
      return projectSourceIngested(event);
    case 'assertion_proposed':
    case 'assertion_confirmed':
    case 'corrected':
      if (ASSERTION_EVENT_TYPES.has(event.eventType)) {
        return projectAssertion(event);
      }
      return { entities: [], edges: [] };
    case 'action_result':
      return projectActionResult(event);
    case 'outcome_recorded':
      return projectOutcomeRecorded(event);
    case 'deleted':
      return projectDeleted(event);
    default:
      return { entities: [], edges: [] };
  }
}

export function projectAgencyGraphFromEvents(
  events: DecryptedVaultEvent[],
): AgencyGraphProjectionDelta {
  const entityMap = new Map<string, AgencyGraphEntityV1>();
  const edgeMap = new Map<string, AgencyGraphEdgeV1>();

  const ordered = [...events].sort((a, b) => {
    if (a.sequence !== b.sequence) {
      return a.sequence - b.sequence;
    }
    return a.eventId.localeCompare(b.eventId);
  });

  for (const event of ordered) {
    const delta = projectSingleEvent(event);
    for (const entity of delta.entities) {
      entityMap.set(entity.entityId, entity);
    }
    for (const edge of delta.edges) {
      edgeMap.set(edge.edgeId, edge);
    }
  }

  return {
    entities: [...entityMap.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)),
    edges: [...edgeMap.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
  };
}

export function rebuildAgencyGraphSnapshotFromEvents(
  events: DecryptedVaultEvent[],
): AgencyGraphProjectionDelta {
  return projectAgencyGraphFromEvents(events);
}
