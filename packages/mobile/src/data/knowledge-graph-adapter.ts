// Knowledge Graph Adapter — Connects mobile to Core's knowledge graph via SemblanceProvider.
// Returns VisualizationGraph for the KnowledgeGraphScreen component.
//
// Uses the mobile runtime's SemblanceCore instance to query the real knowledge graph.
// Falls back to empty graph if core is not initialized.
//
// CRITICAL: No network imports. All queries are local via SQLite + vector store.

import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  VisualizationCluster,
  GraphStats,
} from '../../../../packages/core/knowledge/graph-visualization';
import { getRuntimeState } from '../runtime/mobile-runtime';

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface KnowledgeGraphData {
  graph: VisualizationGraph;
  isEmpty: boolean;
}

/**
 * Fetch the knowledge graph for display.
 * Uses the mobile runtime's SemblanceCore to query real knowledge graph data.
 */
export async function fetchKnowledgeGraph(): Promise<KnowledgeGraphData> {
  const state = getRuntimeState();

  // If core is initialized, try to get real graph data
  if (state.core) {
    try {
      const stats = await state.core.knowledge.getStats();
      const documents = await state.core.knowledge.listDocuments({ limit: 200 });

      // Build visualization nodes from documents
      const nodes: VisualizationNode[] = documents.map((doc, i) => ({
        id: doc.id,
        label: doc.title || doc.sourcePath || 'Untitled',
        type: doc.source as VisualizationNode['type'],
        size: 1,
        x: Math.cos((i / documents.length) * 2 * Math.PI) * 300,
        y: Math.sin((i / documents.length) * 2 * Math.PI) * 300,
        connections: 0,
        metadata: {
          source: doc.source,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      }));

      const graphStats: GraphStats = {
        totalNodes: nodes.length,
        totalEdges: 0,
        nodesByType: {},
        averageConnections: 0,
        mostConnectedNode: nodes[0] ?? null,
        graphDensity: 0,
        growthRate: 0,
        activeSources: Object.keys(stats.sources ?? {}).length,
        totalSources: Object.keys(stats.sources ?? {}).length,
        crossDomainInsights: 0,
      };

      // Count nodes by type
      for (const node of nodes) {
        const type = node.type || 'unknown';
        graphStats.nodesByType[type] = (graphStats.nodesByType[type] || 0) + 1;
      }

      return {
        graph: {
          nodes,
          edges: [],
          clusters: [],
          stats: graphStats,
        },
        isEmpty: nodes.length === 0,
      };
    } catch (err) {
      console.error('[KnowledgeGraphAdapter] Failed to fetch graph:', err);
    }
  }

  // Fallback: empty graph
  const emptyStats: GraphStats = {
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
    graph: { nodes: [], edges: [], clusters: [], stats: emptyStats },
    isEmpty: true,
  };
}
