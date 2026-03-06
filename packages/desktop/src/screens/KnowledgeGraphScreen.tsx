// KnowledgeGraphScreen — Desktop wrapper for the Knowledge Graph visualization.
// Fetches graph data via IPC and renders KnowledgeGraphView with FilterPanel.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SkeletonCard } from '@semblance/ui';
import { KnowledgeGraphView } from '../components/KnowledgeGraphView';
import type { VisualizationGraph, NodeContext } from '../../../core/knowledge/graph-visualization';
import {
  getKnowledgeGraphData,
  getKnowledgeNodeContext,
  exportKnowledgeGraph,
} from '../ipc/commands';

export function KnowledgeGraphScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [graph, setGraph] = useState<VisualizationGraph | null>(null);
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null);

  useEffect(() => {
    getKnowledgeGraphData()
      .then((data) => setGraph(data as unknown as VisualizationGraph))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  if (!graph || (graph.nodes.length === 0 && graph.edges.length === 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <p style={{ color: '#8593A4', fontSize: 14 }}>
          {t('screen.knowledge_graph.empty', 'No knowledge graph data yet. Connect data sources and start chatting to build your graph.')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <KnowledgeGraphView
        graph={graph}
        onExport={handleExport}
        onNodeSelect={handleNodeSelect}
        nodeContext={nodeContext}
      />
    </div>
  );
}
