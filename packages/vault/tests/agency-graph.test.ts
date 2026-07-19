import { describe, expect, it } from 'vitest';
import {
  createProvenanceRecord,
  createRetentionPolicy,
  createSourceRef,
  proposeAssertion,
} from '../src/index.js';
import {
  createAgencyGraphStore,
  computeAgencyGraphSnapshotHash,
} from '../src/agency-graph/store.js';
import { queryAgencyGraph, listAgencyGraphEntitiesByType } from '../src/agency-graph/query.js';
import { projectDocumentsFromEvents } from '../src/projections/documents.js';
import { projectVectorsFromEvents } from '../src/projections/vector.js';
import { projectAgencyGraphFromEvents } from '../src/projections/agency-graph.js';
import type { DecryptedVaultEvent } from '../src/agency-graph/types.js';
import {
  shadowCompareAgencyGraph,
  toShadowComparableGraph,
  type ShadowComparableGraph,
} from '../../core/knowledge/agency-graph-shadow.js';

const RETENTION = createRetentionPolicy({
  policyId: 'retention-default-365d',
  retainUntil: '2027-07-18T00:00:00.000Z',
});

const EMAIL_SOURCE = createSourceRef({
  sourceId: 'email-msg-001',
  sourceType: 'email',
  uri: 'email://gmail/INBOX/abc123',
  ingestedAt: '2026-07-18T11:59:00.000Z',
});

function buildEvents(): DecryptedVaultEvent[] {
  const personAssertion = proposeAssertion({
    assertionId: 'assertion-person-001',
    subject: 'person:alex',
    predicate: 'person.name',
    object: 'Alex Rivera',
    provenance: {
      sourceRefs: [EMAIL_SOURCE],
      derivationMethod: 'direct_extraction',
      confidence: 0.95,
      sensitivity: 'personal',
      retention: RETENTION,
    },
    createdAt: '2026-07-18T12:01:00.000Z',
  });

  const commitmentAssertion = proposeAssertion({
    assertionId: 'assertion-commitment-001',
    subject: 'commitment:q3-report',
    predicate: 'commitment.due',
    object: 'person:alex',
    provenance: {
      sourceRefs: [EMAIL_SOURCE],
      derivationMethod: 'direct_extraction',
      confidence: 0.9,
      sensitivity: 'personal',
      retention: RETENTION,
    },
    createdAt: '2026-07-18T12:02:00.000Z',
  });

  const preferenceAssertion = proposeAssertion({
    assertionId: 'assertion-preference-001',
    subject: 'preference:meeting-time',
    predicate: 'preference.value',
    object: 'morning',
    provenance: {
      sourceRefs: [EMAIL_SOURCE],
      derivationMethod: 'inferred',
      confidence: 0.72,
      sensitivity: 'personal',
      retention: RETENTION,
    },
    createdAt: '2026-07-18T12:03:00.000Z',
  });

  return [
    {
      sequence: 1,
      eventId: 'event-doc-001',
      eventType: 'source_ingested',
      occurredAt: '2026-07-18T12:00:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: {
        schemaVersion: 1,
        documentId: 'doc-q3-report',
        title: 'Q3 Report Draft',
        mimeType: 'application/pdf',
        relatedPersonIds: ['person:alex'],
      },
    },
    {
      sequence: 2,
      eventId: 'event-assertion-person',
      eventType: 'assertion_confirmed',
      occurredAt: '2026-07-18T12:01:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: { assertion: personAssertion },
    },
    {
      sequence: 3,
      eventId: 'event-assertion-commitment',
      eventType: 'assertion_confirmed',
      occurredAt: '2026-07-18T12:02:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: { assertion: commitmentAssertion },
    },
    {
      sequence: 4,
      eventId: 'event-assertion-preference',
      eventType: 'assertion_proposed',
      occurredAt: '2026-07-18T12:03:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: { assertion: preferenceAssertion },
    },
    {
      sequence: 5,
      eventId: 'event-action-001',
      eventType: 'action_result',
      occurredAt: '2026-07-18T12:04:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: {
        schemaVersion: 1,
        actionId: 'action:send-reminder',
        actionType: 'email.send',
        label: 'Send Q3 reminder',
        targetEntityId: 'person:alex',
        status: 'success',
        estimatedTimeSavedSeconds: 300,
      },
    },
    {
      sequence: 6,
      eventId: 'event-outcome-001',
      eventType: 'outcome_recorded',
      occurredAt: '2026-07-18T12:05:00.000Z',
      sourceRefs: [EMAIL_SOURCE],
      sensitivity: 'personal',
      payload: {
        schemaVersion: 1,
        outcomeId: 'outcome:reminder-sent',
        actionId: 'action:send-reminder',
        label: 'Reminder delivered',
        success: true,
      },
    },
  ];
}

describe('agency graph projection', () => {
  it('projects entities, documents, commitments, preferences, actions, and outcomes from events', () => {
    const events = buildEvents();
    const store = createAgencyGraphStore();
    const snapshot = store.rebuild(events);

    expect(snapshot.entityCount).toBeGreaterThanOrEqual(6);
    expect(snapshot.edgeCount).toBeGreaterThanOrEqual(3);

    const documents = listAgencyGraphEntitiesByType(store, 'document', 10);
    const people = listAgencyGraphEntitiesByType(store, 'person', 10);
    const commitments = listAgencyGraphEntitiesByType(store, 'commitment', 10);
    const preferences = listAgencyGraphEntitiesByType(store, 'preference', 10);
    const actions = listAgencyGraphEntitiesByType(store, 'action', 10);
    const outcomes = listAgencyGraphEntitiesByType(store, 'outcome', 10);

    expect(documents).toHaveLength(1);
    expect(documents[0]?.entityId).toBe('doc-q3-report');
    expect(people.some((entity) => entity.entityId === 'person:alex')).toBe(true);
    expect(commitments.some((entity) => entity.entityId === 'commitment:q3-report')).toBe(true);
    expect(preferences.some((entity) => entity.entityId === 'preference:meeting-time')).toBe(true);
    expect(actions.some((entity) => entity.entityId === 'action:send-reminder')).toBe(true);
    expect(outcomes.some((entity) => entity.entityId === 'outcome:reminder-sent')).toBe(true);

    const documentProjection = projectDocumentsFromEvents(events);
    expect(documentProjection.documentCount).toBe(1);
    expect(documentProjection.documents[0]?.title).toBe('Q3 Report Draft');

    const vectorProjection = projectVectorsFromEvents(events);
    expect(vectorProjection.chunkCount).toBe(1);
    expect(vectorProjection.chunks[0]?.documentId).toBe('doc-q3-report');

    const neighborhood = queryAgencyGraph(store, { entityId: 'person:alex', depth: 2 }, 20);
    expect(neighborhood.entities.some((entity) => entity.entityId === 'person:alex')).toBe(true);
    expect(neighborhood.entities.some((entity) => entity.entityId === 'doc-q3-report')).toBe(true);
  });

  it('rebuild is deterministic and produces stable snapshot hash', () => {
    const events = buildEvents();
    const shuffled = [...events].sort((a, b) => b.sequence - a.sequence);

    const storeA = createAgencyGraphStore();
    const storeB = createAgencyGraphStore();

    const snapshotA = storeA.rebuild(events);
    const snapshotB = storeB.rebuild(shuffled);

    expect(snapshotA.snapshotHash).toBe(snapshotB.snapshotHash);
    expect(snapshotA.entityCount).toBe(snapshotB.entityCount);
    expect(snapshotA.edgeCount).toBe(snapshotB.edgeCount);

    const directProjection = projectAgencyGraphFromEvents(shuffled);
    const directHash = computeAgencyGraphSnapshotHash(
      directProjection.entities.filter((entity) => entity.active),
      directProjection.edges.filter((edge) => edge.active),
    );
    expect(snapshotA.snapshotHash).toBe(directHash);
  });

  it('shadow-compares against a legacy visualization fixture', () => {
    const events = buildEvents();
    const store = createAgencyGraphStore();
    const snapshot = store.rebuild(events);

    const legacyFixture: ShadowComparableGraph = {
      nodes: [
        {
          id: 'doc-q3-report',
          label: 'Q3 Report Draft',
          type: 'document',
          domain: 'general',
          metadata: {},
        },
        {
          id: 'person:alex',
          label: 'person:alex',
          type: 'person',
          domain: 'personal',
          metadata: {},
        },
        {
          id: 'commitment:q3-report',
          label: 'person:alex',
          type: 'commitment',
          domain: 'work',
          metadata: {},
        },
        {
          id: 'preference:meeting-time',
          label: 'morning',
          type: 'preference',
          domain: 'personal',
          metadata: {},
        },
        {
          id: 'action:send-reminder',
          label: 'Send Q3 reminder',
          type: 'action',
          domain: 'general',
          metadata: {},
        },
        {
          id: 'outcome:reminder-sent',
          label: 'Reminder delivered',
          type: 'outcome',
          domain: 'general',
          metadata: {},
        },
      ],
      edges: [
        {
          id: 'legacy-edge-doc-person',
          sourceId: 'doc-q3-report',
          targetId: 'person:alex',
          label: 'mentions_person',
          weight: 0.8,
        },
        {
          id: 'legacy-edge-commitment-person',
          sourceId: 'commitment:q3-report',
          targetId: 'person:alex',
          label: 'commitment_involves',
          weight: 0.9,
        },
        {
          id: 'legacy-edge-action-person',
          sourceId: 'action:send-reminder',
          targetId: 'person:alex',
          label: 'action_target',
          weight: 1,
        },
        {
          id: 'legacy-edge-action-outcome',
          sourceId: 'action:send-reminder',
          targetId: 'outcome:reminder-sent',
          label: 'produced_outcome',
          weight: 1,
        },
      ],
    };

    const vaultComparable = toShadowComparableGraph({
      entities: snapshot.entities.map((entity) => ({
        entityId: entity.entityId,
        entityType: entity.entityType,
        label: entity.label,
        properties: entity.properties,
      })),
      edges: snapshot.edges.map((edge) => ({
        edgeId: edge.edgeId,
        sourceEntityId: edge.sourceEntityId,
        targetEntityId: edge.targetEntityId,
        relation: edge.relation,
        weight: edge.weight,
      })),
      snapshotHash: snapshot.snapshotHash,
    });

    expect(vaultComparable.nodes.length).toBeGreaterThanOrEqual(legacyFixture.nodes.length);

    const comparison = shadowCompareAgencyGraph(
      {
        entities: snapshot.entities.map((entity) => ({
          entityId: entity.entityId,
          entityType: entity.entityType,
          label: entity.label,
          properties: entity.properties,
        })),
        edges: snapshot.edges.map((edge) => ({
          edgeId: edge.edgeId,
          sourceEntityId: edge.sourceEntityId,
          targetEntityId: edge.targetEntityId,
          relation: edge.relation,
          weight: edge.weight,
        })),
        snapshotHash: snapshot.snapshotHash,
      },
      legacyFixture,
    );

    expect(comparison.missingInLegacy).toHaveLength(0);
    expect(comparison.edgeMismatches.filter((m) => m.reason.includes('missing in legacy'))).toHaveLength(0);
    expect(comparison.vaultNodeCount).toBeGreaterThanOrEqual(comparison.legacyNodeCount);
  });
});
