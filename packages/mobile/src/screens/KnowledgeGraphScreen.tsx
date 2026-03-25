/**
 * KnowledgeGraphScreen — Mobile wrapper for the Skia-based Knowledge Graph.
 *
 * Uses the production-quality @semblance/ui KnowledgeGraph (Skia renderer)
 * instead of a WebView. Provides header, stats, filter sheet, and node detail.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { KnowledgeGraph } from '@semblance/ui';
import type { KnowledgeNode, KnowledgeEdge } from '@semblance/ui';
import { styles } from './KnowledgeGraphScreen.styles';
import { GraphFilterSheet } from './GraphFilterSheet';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  NodeContext,
  CategoryNode,
} from '../../../../packages/core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../../../packages/core/knowledge/connector-category-map';
import { getAllCategories } from '../../../../packages/core/knowledge/connector-category-map';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeGraphScreenProps {
  graph: VisualizationGraph;
  categoryNodes?: CategoryNode[];
  nodeContext?: NodeContext | null;
  onNodeSelect?: (nodeId: string) => void;
  onExport?: () => void;
}

// ─── Converters (match desktop KnowledgeGraphView pattern) ──────────────────

function deriveSublabel(n: VisualizationNode): string | undefined {
  const meta = n.metadata ?? {};
  if (n.type === 'category') {
    const count = meta.nodeCount as number | undefined;
    return count != null ? `${count} entities` : undefined;
  }
  if (n.type === 'person') {
    const count = meta.interactionCount as number | undefined;
    if (count != null) return `${count} interactions`;
    const org = meta.organization as string | undefined;
    return org ?? undefined;
  }
  if (n.type === 'document' || n.type === 'directory') {
    const source = meta.source as string | undefined;
    const ext = meta.extension as string | undefined;
    if (ext) return ext.toUpperCase().replace('.', '');
    if (source) return source.replace(/_/g, ' ');
    return undefined;
  }
  if (n.type === 'event') {
    return meta.when as string | undefined;
  }
  if (n.type === 'email_thread') {
    const count = meta.messageCount as number | undefined;
    return count != null ? `${count} messages` : undefined;
  }
  if (n.type === 'topic') {
    const count = meta.mentionCount as number | undefined;
    return count != null ? `${count} mentions` : undefined;
  }
  return undefined;
}

function toKnowledgeNode(n: VisualizationNode): KnowledgeNode {
  const meta = n.metadata ?? {};
  if (meta.activityScore == null) {
    meta.activityScore = Math.min(1, (n.size ?? 1) / 20);
  }

  return {
    id: n.id,
    type: n.type === 'person' ? 'person'
      : n.type === 'event' ? 'calendar'
      : n.type === 'document' ? 'file'
      : n.type === 'category' ? 'category'
      : 'topic',
    label: n.label,
    sublabel: deriveSublabel(n),
    weight: n.size,
    metadata: meta,
  };
}

function toKnowledgeEdge(e: VisualizationEdge): KnowledgeEdge {
  return { source: e.sourceId, target: e.targetId, weight: e.weight };
}

// ─── Component ──────────────────────────────────────────────────────────────

export const KnowledgeGraphScreen: React.FC<KnowledgeGraphScreenProps> = ({
  graph,
  categoryNodes,
  nodeContext,
  onNodeSelect,
  onExport,
}) => {
  const { t } = useTranslation();
  const [showStats, setShowStats] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<Set<VisualizationCategory>>(
    () => new Set(getAllCategories()),
  );

  const handleToggleCategory = useCallback((category: VisualizationCategory) => {
    setEnabledCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Convert VisualizationGraph nodes/edges to KnowledgeNode/KnowledgeEdge for Skia renderer
  const kgNodes = useMemo(() => graph.nodes.map(toKnowledgeNode), [graph.nodes]);
  const kgEdges = useMemo(() => graph.edges.map(toKnowledgeEdge), [graph.edges]);

  // Get screen dimensions for the graph
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  // Reserve space for header (~56px) + stats (~60px if visible)
  const graphHeight = screenHeight - (showStats ? 180 : 120);

  const handleNodeSelectInternal = useCallback((node: KnowledgeNode | null) => {
    if (node) {
      setSelectedNodeId(node.id);
      onNodeSelect?.(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, [onNodeSelect]);

  // Determine layout mode
  const layoutMode = useMemo(() => {
    const hasCategoryNodes = kgNodes.some(n => n.type === 'category');
    return hasCategoryNodes ? 'radial' as const : 'force' as const;
  }, [kgNodes]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('screen.knowledge_graph.title')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowFilter(prev => !prev)}
            testID="filter-toggle"
          >
            <Text style={styles.headerButtonText}>[Filter]</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowStats(prev => !prev)}
          >
            <Text style={styles.headerButtonText}>[Stats]</Text>
          </TouchableOpacity>
          {onExport && (
            <TouchableOpacity style={styles.headerButton} onPress={onExport}>
              <Text style={styles.headerButtonText}>[Export]</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Collapsible Stats */}
      {showStats && (
        <View style={styles.statsCollapsed}>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{graph.stats.totalNodes}</Text>
              <Text style={styles.statLabel}>{t('screen.knowledge_graph.entities')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{graph.stats.totalEdges}</Text>
              <Text style={styles.statLabel}>{t('screen.knowledge_graph.connections')}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {graph.stats.activeSources != null
                  ? `${graph.stats.activeSources}/${graph.stats.totalSources ?? 10}`
                  : graph.stats.growthRate}
              </Text>
              <Text style={styles.statLabel}>
                {graph.stats.activeSources != null ? 'Sources' : 'New (7d)'}
              </Text>
            </View>
            {graph.stats.crossDomainInsights != null && (
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{graph.stats.crossDomainInsights}</Text>
                <Text style={styles.statLabel}>{t('screen.knowledge_graph.insights')}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Skia Knowledge Graph Renderer */}
      <View style={styles.graphContainer} testID="graph-skia">
        <KnowledgeGraph
          nodes={kgNodes}
          edges={kgEdges}
          width={screenWidth}
          height={Math.max(graphHeight, 300)}
          layoutMode={layoutMode}
          isMobile={true}
          onNodeSelect={handleNodeSelectInternal}
        />
      </View>

      {/* Filter Sheet */}
      {showFilter && categoryNodes && (
        <GraphFilterSheet
          categories={categoryNodes}
          enabledCategories={enabledCategories}
          onToggleCategory={handleToggleCategory}
          onClose={() => setShowFilter(false)}
        />
      )}

      {/* Bottom Sheet for Node Detail */}
      {nodeContext && selectedNodeId && (
        <View style={styles.bottomSheet}>
          <View style={styles.bottomSheetHandle} />
          <Text style={styles.nodeTitle}>{nodeContext.node.label}</Text>
          <Text style={styles.nodeType}>{nodeContext.node.type} / {nodeContext.node.domain}</Text>
          <ScrollView>
            {nodeContext.connections.slice(0, 10).map(conn => (
              <View key={conn.node.id} style={styles.connectionItem}>
                <Text style={styles.connectionText}>{conn.node.label}</Text>
                <Text style={styles.connectionLabel}>{conn.edge.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};
