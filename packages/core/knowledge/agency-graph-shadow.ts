import type { VisualizationGraph } from './graph-visualization.js';

export interface ShadowComparableNode {
  id: string;
  label: string;
  type: string;
  domain: string;
  metadata: Record<string, unknown>;
}

export interface ShadowComparableEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  weight: number;
}

export interface ShadowComparableGraph {
  nodes: ShadowComparableNode[];
  edges: ShadowComparableEdge[];
}

export interface AgencyGraphShadowSnapshot {
  entities: Array<{
    entityId: string;
    entityType: string;
    label: string;
    properties: Record<string, unknown>;
  }>;
  edges: Array<{
    edgeId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relation: string;
    weight: number;
  }>;
  snapshotHash?: string;
}

export interface ShadowCompareResult {
  match: boolean;
  nodeCountMatch: boolean;
  edgeCountMatch: boolean;
  missingInVault: ShadowComparableNode[];
  missingInLegacy: ShadowComparableNode[];
  edgeMismatches: Array<{ edgeId: string; reason: string }>;
  vaultNodeCount: number;
  legacyNodeCount: number;
  vaultEdgeCount: number;
  legacyEdgeCount: number;
}

function agencyDomainForEntityType(entityType: string): string {
  switch (entityType) {
    case 'person':
      return 'personal';
    case 'document':
      return 'general';
    case 'commitment':
      return 'work';
    case 'preference':
      return 'personal';
    case 'action':
      return 'general';
    case 'outcome':
      return 'general';
    default:
      return 'general';
  }
}

export function toShadowComparableGraph(
  snapshot: AgencyGraphShadowSnapshot,
): ShadowComparableGraph {
  const nodes: ShadowComparableNode[] = snapshot.entities
    .map((entity) => ({
      id: entity.entityId,
      label: entity.label,
      type: entity.entityType,
      domain: agencyDomainForEntityType(entity.entityType),
      metadata: { ...entity.properties },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const edges: ShadowComparableEdge[] = snapshot.edges
    .map((edge) => ({
      id: edge.edgeId,
      sourceId: edge.sourceEntityId,
      targetId: edge.targetEntityId,
      label: edge.relation,
      weight: edge.weight,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges };
}

export function visualizationGraphToShadowComparable(
  graph: VisualizationGraph,
): ShadowComparableGraph {
  const agencyTypes = new Set([
    'person',
    'document',
    'commitment',
    'preference',
    'action',
    'outcome',
  ]);

  const nodes: ShadowComparableNode[] = graph.nodes
    .filter((node) => agencyTypes.has(node.type))
    .map((node) => ({
      id: node.id,
      label: node.label,
      type: node.type,
      domain: node.domain,
      metadata: { ...node.metadata },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: ShadowComparableEdge[] = graph.edges
    .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
    .map((edge) => ({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      label: edge.label,
      weight: edge.weight,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges };
}

function nodeKey(node: ShadowComparableNode): string {
  return `${node.id}|${node.type}|${node.label}`;
}

function edgeKey(edge: ShadowComparableEdge): string {
  return `${edge.sourceId}|${edge.targetId}|${edge.label}`;
}

export function shadowCompareAgencyGraph(
  vaultSnapshot: AgencyGraphShadowSnapshot,
  legacyGraph: ShadowComparableGraph | VisualizationGraph,
): ShadowCompareResult {
  const vaultComparable = toShadowComparableGraph(vaultSnapshot);
  const legacyComparable =
    'clusters' in legacyGraph
      ? visualizationGraphToShadowComparable(legacyGraph)
      : legacyGraph;

  const vaultNodeKeys = new Set(vaultComparable.nodes.map(nodeKey));
  const legacyNodeKeys = new Set(legacyComparable.nodes.map(nodeKey));

  const missingInVault = legacyComparable.nodes.filter(
    (node) => !vaultNodeKeys.has(nodeKey(node)),
  );
  const missingInLegacy = vaultComparable.nodes.filter(
    (node) => !legacyNodeKeys.has(nodeKey(node)),
  );

  const legacyEdgeKeys = new Map(
    legacyComparable.edges.map((edge) => [edgeKey(edge), edge] as const),
  );
  const edgeMismatches: Array<{ edgeId: string; reason: string }> = [];

  for (const edge of vaultComparable.edges) {
    const key = edgeKey(edge);
    const legacyEdge = legacyEdgeKeys.get(key);
    if (!legacyEdge) {
      edgeMismatches.push({ edgeId: edge.id, reason: 'missing in legacy graph' });
      continue;
    }
    if (Math.abs(edge.weight - legacyEdge.weight) > 0.001) {
      edgeMismatches.push({
        edgeId: edge.id,
        reason: `weight mismatch vault=${edge.weight} legacy=${legacyEdge.weight}`,
      });
    }
  }

  for (const edge of legacyComparable.edges) {
    const key = edgeKey(edge);
    const vaultHas = vaultComparable.edges.some((candidate) => edgeKey(candidate) === key);
    if (!vaultHas) {
      edgeMismatches.push({ edgeId: edge.id, reason: 'missing in vault graph' });
    }
  }

  const nodeCountMatch = vaultComparable.nodes.length === legacyComparable.nodes.length;
  const edgeCountMatch = vaultComparable.edges.length === legacyComparable.edges.length;
  const match =
    missingInVault.length === 0 &&
    missingInLegacy.length === 0 &&
    edgeMismatches.length === 0;

  return {
    match,
    nodeCountMatch,
    edgeCountMatch,
    missingInVault,
    missingInLegacy,
    edgeMismatches,
    vaultNodeCount: vaultComparable.nodes.length,
    legacyNodeCount: legacyComparable.nodes.length,
    vaultEdgeCount: vaultComparable.edges.length,
    legacyEdgeCount: legacyComparable.edges.length,
  };
}
