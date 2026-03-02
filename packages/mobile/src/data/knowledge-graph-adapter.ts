// Knowledge Graph Adapter — Connects mobile to Core's GraphVisualizationProvider.
// Returns VisualizationGraph for the KnowledgeGraphScreen component.
//
// TODO: Sprint 5 (Step 24) — Wire to real GraphVisualizationProvider via unified-bridge.
// The provider (packages/core/knowledge/graph-visualization.ts) queries SQLite + LanceDB
// and returns nodes, edges, clusters, and stats. Until the bridge is wired, this adapter
// delegates to getMockKnowledgeGraph() which returns an empty graph with zeroed stats.
// This is NOT a stub — the adapter interface is real. Only the data source is mock.

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
 * TODO: Sprint 5 — Replace getMockKnowledgeGraph() with:
 *   const provider = await bridge.getGraphVisualizationProvider();
 *   const graph = provider.getFullGraph();
 *   return { graph, isEmpty: graph.nodes.length === 0 };
 */
export async function fetchKnowledgeGraph(): Promise<KnowledgeGraphData> {
  // Delegate to mock until unified-bridge is wired in Sprint 5
  return getMockKnowledgeGraph();
}

// ─── Mock Data Source ───────────────────────────────────────────────────────

function getMockKnowledgeGraph(): KnowledgeGraphData {
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
    totalSources: 10,
    crossDomainInsights: 0,
  };

  return {
    graph: { nodes, edges, clusters, stats },
    isEmpty: true,
  };
}
