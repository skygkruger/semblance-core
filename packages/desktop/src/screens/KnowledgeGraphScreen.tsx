// KnowledgeGraphScreen — Desktop wrapper for the Knowledge Graph visualization.
// Fetches graph data via IPC and renders KnowledgeGraphView with FilterPanel.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SkeletonCard } from '@semblance/ui';
import { KnowledgeGraphView } from '../components/KnowledgeGraphView';
import type { VisualizationGraph, NodeContext } from '../../../core/knowledge/graph-visualization';
import type { VisualizationGraphV2 } from '../components/KnowledgeGraphView';
import {
  getKnowledgeGraphData,
  getKnowledgeNodeContext,
  exportKnowledgeGraph,
} from '../ipc/commands';
import { useTauriEvent } from '../hooks/useTauriEvent';

export function KnowledgeGraphScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<VisualizationGraph | null>(null);
  const [categoryGraph, setCategoryGraph] = useState<VisualizationGraphV2 | null>(null);
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(() => {
    setLoading(true);
    setError(null);
    getKnowledgeGraphData()
      .then((data) => {
        const g = data as unknown as VisualizationGraphV2;
        console.log('[KnowledgeGraphScreen] graph data:', g?.nodes?.length, 'nodes,', g?.edges?.length, 'edges,', g?.categoryNodes?.length, 'categories');
        setGraph(g);
        // If the response includes categoryNodes/categoryEdges, set as categoryGraph
        if (g?.categoryNodes && g?.categoryEdges) {
          setCategoryGraph(g);
        }
      })
      .catch((err) => {
        console.error('[KnowledgeGraphScreen] failed to fetch graph:', err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Auto-refresh when indexing completes
  useTauriEvent('semblance://indexing-complete', useCallback(() => {
    console.log('[KnowledgeGraphScreen] indexing-complete event — refreshing graph');
    fetchGraph();
  }, [fetchGraph]));

  const handleNodeSelect = useCallback(async (nodeId: string) => {
    try {
      const context = await getKnowledgeNodeContext(nodeId);
      setNodeContext(context as unknown as NodeContext);
    } catch {
      setNodeContext(null);
    }
  }, []);

  const handleExport = useCallback(async () => {
    try {
      await exportKnowledgeGraph();
    } catch {
      // Export failed — silently handle
    }
  }, []);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <SkeletonCard variant="indexing" message={t('screen.knowledge_graph.loading')} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <p style={{ color: '#B07A8A', fontSize: 14, marginBottom: 12 }}>
          {t('screen.knowledge_graph.error', 'Failed to load knowledge graph.')}
        </p>
        <p style={{ color: '#5E6B7C', fontSize: 12, marginBottom: 16 }}>{error}</p>
        <button
          onClick={fetchGraph}
          style={{
            background: '#6ECFA3',
            color: '#0B0E11',
            border: 'none',
            borderRadius: 4,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  if (!graph || !graph.nodes || !graph.edges || (graph.nodes.length === 0 && graph.edges.length === 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <p style={{ color: '#8593A4', fontSize: 14, marginBottom: 12 }}>
          {t('screen.knowledge_graph.empty', 'No knowledge graph data yet. Connect data sources or index files to build your graph.')}
        </p>
        <button
          onClick={fetchGraph}
          style={{
            background: 'transparent',
            color: '#6ECFA3',
            border: '1px solid #6ECFA3',
            borderRadius: 4,
            padding: '8px 16px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {t('common.refresh', 'Refresh')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <KnowledgeGraphView
        graph={graph}
        categoryGraph={categoryGraph ?? undefined}
        onExport={handleExport}
        onNodeSelect={handleNodeSelect}
        nodeContext={nodeContext}
      />
    </div>
  );
}
