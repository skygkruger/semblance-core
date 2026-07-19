import { createHash } from 'node:crypto';
import type {
  AgencyGraphEdgeV1,
  AgencyGraphEntityV1,
  AgencyGraphSnapshotV1,
  DecryptedVaultEvent,
} from './types.js';
import { projectAgencyGraphFromEvents } from '../projections/agency-graph.js';

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

export function computeAgencyGraphSnapshotHash(
  entities: AgencyGraphEntityV1[],
  edges: AgencyGraphEdgeV1[],
): string {
  const sortedEntities = [...entities].sort((a, b) => a.entityId.localeCompare(b.entityId));
  const sortedEdges = [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const canonical = canonicalJson({ entities: sortedEntities, edges: sortedEdges });
  return createHash('sha256').update(canonical, 'utf-8').digest('hex');
}

export class AgencyGraphStore {
  private entities = new Map<string, AgencyGraphEntityV1>();
  private edges = new Map<string, AgencyGraphEdgeV1>();
  private appliedEventIds = new Set<string>();
  private builtFromEventCount = 0;

  applyProjection(
    entity: AgencyGraphEntityV1,
    edges: AgencyGraphEdgeV1[],
    eventId: string,
  ): void {
    if (this.appliedEventIds.has(eventId)) {
      return;
    }

    this.entities.set(entity.entityId, entity);
    for (const edge of edges) {
      this.edges.set(edge.edgeId, edge);
    }
    this.appliedEventIds.add(eventId);
    this.builtFromEventCount += 1;
  }

  applyEvent(event: DecryptedVaultEvent): void {
    if (this.appliedEventIds.has(event.eventId)) {
      return;
    }

    const delta = projectAgencyGraphFromEvents([event]);
    for (const entity of delta.entities) {
      this.entities.set(entity.entityId, entity);
    }
    for (const edge of delta.edges) {
      this.edges.set(edge.edgeId, edge);
    }
    this.appliedEventIds.add(event.eventId);
    this.builtFromEventCount += 1;
  }

  rebuild(events: DecryptedVaultEvent[]): AgencyGraphSnapshotV1 {
    this.entities.clear();
    this.edges.clear();
    this.appliedEventIds.clear();
    this.builtFromEventCount = 0;

    const ordered = [...events].sort((a, b) => {
      if (a.sequence !== b.sequence) {
        return a.sequence - b.sequence;
      }
      return a.eventId.localeCompare(b.eventId);
    });

    for (const event of ordered) {
      this.applyEvent(event);
    }

    return this.snapshot();
  }

  getEntity(entityId: string): AgencyGraphEntityV1 | undefined {
    return this.entities.get(entityId);
  }

  listEntities(): AgencyGraphEntityV1[] {
    return [...this.entities.values()].sort((a, b) => a.entityId.localeCompare(b.entityId));
  }

  listEdges(): AgencyGraphEdgeV1[] {
    return [...this.edges.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  }

  snapshot(): AgencyGraphSnapshotV1 {
    const entities = this.listEntities().filter((entity) => entity.active);
    const edges = this.listEdges().filter((edge) => edge.active);
    const snapshotHash = computeAgencyGraphSnapshotHash(entities, edges);

    return {
      schemaVersion: 1,
      entities,
      edges,
      snapshotHash,
      entityCount: entities.length,
      edgeCount: edges.length,
      builtFromEventCount: this.builtFromEventCount,
    };
  }
}

export function createAgencyGraphStore(): AgencyGraphStore {
  return new AgencyGraphStore();
}
