import type { AgencyGraphPatternV1 } from '@semblance/protocol';
import type { AgencyEntityType, AgencyGraphEntityV1, AgencyGraphEdgeV1 } from './types.js';
import type { AgencyGraphStore } from './store.js';

export interface AgencyGraphQueryResult {
  entities: AgencyGraphEntityV1[];
  edges: AgencyGraphEdgeV1[];
  truncated: boolean;
}

function collectNeighborhood(
  store: AgencyGraphStore,
  rootEntityId: string,
  maxDepth: number,
  relationFilter: string | undefined,
): { entityIds: Set<string>; edges: AgencyGraphEdgeV1[] } {
  const entityIds = new Set<string>([rootEntityId]);
  const collectedEdges: AgencyGraphEdgeV1[] = [];
  const seenEdges = new Set<string>();

  let frontier = new Set<string>([rootEntityId]);

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const nextFrontier = new Set<string>();

    for (const edge of store.listEdges()) {
      if (!edge.active) {
        continue;
      }
      if (relationFilter && edge.relation !== relationFilter) {
        continue;
      }

      const touchesFrontier =
        frontier.has(edge.sourceEntityId) || frontier.has(edge.targetEntityId);
      if (!touchesFrontier) {
        continue;
      }

      if (!seenEdges.has(edge.edgeId)) {
        seenEdges.add(edge.edgeId);
        collectedEdges.push(edge);
      }

      if (frontier.has(edge.sourceEntityId)) {
        entityIds.add(edge.targetEntityId);
        nextFrontier.add(edge.targetEntityId);
      }
      if (frontier.has(edge.targetEntityId)) {
        entityIds.add(edge.sourceEntityId);
        nextFrontier.add(edge.sourceEntityId);
      }
    }

    frontier = nextFrontier;
    if (frontier.size === 0) {
      break;
    }
  }

  return { entityIds, edges: collectedEdges };
}

export function queryAgencyGraph(
  store: AgencyGraphStore,
  pattern: AgencyGraphPatternV1,
  limit: number,
): AgencyGraphQueryResult {
  const allEntities = store.listEntities().filter((entity) => entity.active);

  if (pattern.entityId) {
    const depth = pattern.depth ?? 1;
    const relation = pattern.relation;
    const root = store.getEntity(pattern.entityId);
    if (!root || !root.active) {
      return { entities: [], edges: [], truncated: false };
    }

    const { entityIds, edges } = collectNeighborhood(store, pattern.entityId, depth, relation);
    const entities = [...entityIds]
      .map((id) => store.getEntity(id))
      .filter((entity): entity is AgencyGraphEntityV1 => entity !== undefined && entity.active)
      .sort((a, b) => a.entityId.localeCompare(b.entityId));

    const truncated = entities.length > limit;
    return {
      entities: entities.slice(0, limit),
      edges: edges.sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
      truncated,
    };
  }

  let filtered = allEntities;
  if (pattern.relation) {
    const relatedIds = new Set<string>();
    for (const edge of store.listEdges()) {
      if (edge.active && edge.relation === pattern.relation) {
        relatedIds.add(edge.sourceEntityId);
        relatedIds.add(edge.targetEntityId);
      }
    }
    filtered = allEntities.filter((entity) => relatedIds.has(entity.entityId));
  }

  filtered = filtered.sort((a, b) => a.entityId.localeCompare(b.entityId));
  const truncated = filtered.length > limit;
  const entities = filtered.slice(0, limit);
  const entityIdSet = new Set(entities.map((entity) => entity.entityId));
  const edges = store
    .listEdges()
    .filter(
      (edge) =>
        edge.active &&
        entityIdSet.has(edge.sourceEntityId) &&
        entityIdSet.has(edge.targetEntityId),
    )
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  return { entities, edges, truncated };
}

export function listAgencyGraphEntitiesByType(
  store: AgencyGraphStore,
  entityType: AgencyEntityType,
  limit: number,
): AgencyGraphEntityV1[] {
  const entities = store
    .listEntities()
    .filter((entity) => entity.active && entity.entityType === entityType)
    .sort((a, b) => a.entityId.localeCompare(b.entityId));

  return entities.slice(0, limit);
}
