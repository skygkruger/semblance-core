// Knowledge Graph Adapter — Connects mobile to Core's GraphVisualizationProvider.
// Returns VisualizationGraph for the KnowledgeGraphScreen component.
//
// Requires unified-bridge wiring to real GraphVisualizationProvider.
// The provider (packages/core/knowledge/graph-visualization.ts) queries SQLite + LanceDB
// and returns nodes, edges, clusters, and stats. Until the bridge is wired, this adapter
// returns an empty graph with zeroed stats.

import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  VisualizationCluster,
  GraphStats,
} from '../../../../packages/core/knowledge/graph-visualization';

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface KnowledgeGraphData {
  graph: VisualizationGraph;
  isEmpty: boolean;
}

/**
 * Fetch the knowledge graph for display.
 *
 * Returns an empty graph until GraphVisualizationProvider is wired via unified-bridge.
 * Once wired, this will call:
 *   const provider = await bridge.getGraphVisualizationProvider();
 *   const graph = provider.getFullGraph();
 *   return { graph, isEmpty: graph.nodes.length === 0 };
 */
export async function fetchKnowledgeGraph(): Promise<KnowledgeGraphData> {
  const nodes: VisualizationNode[] = [];
  const edges: VisualizationEdge[] = [];
  const clusters: VisualizationCluster[] = [];
  const stats: GraphStats = {
    totalNodes: 0,
    totalEdges: 0,
    nodesByType: {},
    averageConnections: 0,
    mostConnectedNode: null,
    graphDensity: 0,
    growthRate: 0,
    activeSources: 0,
    totalSources: 0,
    crossDomainInsights: 0,
  };

  return {
    graph: { nodes, edges, clusters, stats },
    isEmpty: true,
  };
}
