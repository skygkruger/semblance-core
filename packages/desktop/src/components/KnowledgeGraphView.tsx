/**
 * KnowledgeGraphView — Main view for the Visual Knowledge Graph.
 *
 * Header with stats/export buttons. ForceGraph in center. Time slider below.
 * Node detail panel (shown on node click).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ForceGraph } from './d3/ForceGraph';
import { FilterPanel } from './FilterPanel';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  GraphStats,
  NodeContext,
  CategoryNode,
  CategoryEdge,
} from '../../../core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../../core/knowledge/connector-category-map';
import { getAllCategories, CATEGORY_META } from '../../../core/knowledge/connector-category-map';

// ─── Types ───────────────────────────────────────────────────────────────────

export type VisualizationGraphV2 = VisualizationGraph & {
  categoryNodes: CategoryNode[];
  categoryEdges: CategoryEdge[];
};

export interface KnowledgeGraphViewProps {
  graph: VisualizationGraph;
  categoryGraph?: VisualizationGraphV2;
  onExport?: () => void;
  onNodeSelect?: (nodeId: string) => void;
  onNavigateToConnections?: (category: VisualizationCategory) => void;
  nodeContext?: NodeContext | null;
  width?: number;
  height?: number;
}

// ─── Sub-Components ────────────────────────────────────────────────────────

interface StatsOverlayProps {
  stats: GraphStats;
  visible: boolean;
}

export const StatsOverlay: React.FC<StatsOverlayProps> = ({ stats, visible }) => {
  if (!visible) return null;

  const activeSourcesPct = stats.activeSources != null && stats.totalSources
    ? Math.round((stats.activeSources / stats.totalSources) * 100)
    : null;

  // Build a simple bar indicator
  const barLength = 12;
  const filledBars = activeSourcesPct != null
    ? Math.round((activeSourcesPct / 100) * barLength)
    : 0;
  const bar = activeSourcesPct != null
    ? '\u2588'.repeat(filledBars) + '\u2591'.repeat(barLength - filledBars)
    : null;

  return (
    <div
      data-testid="stats-overlay"
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        padding: '12px 16px',
        background: 'rgba(26, 26, 46, 0.9)',
        border: '1px solid #3a3a5e',
        borderRadius: 4,
        color: '#E2E4E9',
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontSize: 12,
        minWidth: 220,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Your Knowledge Graph</div>
      <div>{stats.totalNodes.toLocaleString()} entities | {stats.totalEdges.toLocaleString()} connections</div>
      {stats.activeSources != null && stats.totalSources != null && (
        <div style={{ marginTop: 4 }}>
          Active sources: {stats.activeSources} of {stats.totalSources}  {bar} {activeSourcesPct}%
        </div>
      )}
      {stats.mostConnectedNode && (
        <div style={{ marginTop: 4 }}>
          Most connected: {stats.mostConnectedNode.label}
        </div>
      )}
      {stats.fastestGrowingCategory && (
        <div>Fastest growing: {stats.fastestGrowingCategory}</div>
      )}
      {stats.crossDomainInsights != null && (
        <div>Cross-domain insights: {stats.crossDomainInsights.toLocaleString()}</div>
      )}
    </div>
  );
};

interface NodeDetailPanelProps {
  context: NodeContext;
  onClose: () => void;
}

export const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ context, onClose }) => {
  return (
    <div
      data-testid="node-detail-panel"
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 300,
        background: 'rgba(26, 26, 46, 0.95)',
        borderLeft: '1px solid #3a3a5e',
        padding: 16,
        color: '#E2E4E9',
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontSize: 12,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{context.node.label}</span>
        <button onClick={onClose} style={{ cursor: 'pointer', background: 'none', border: 'none', color: '#E2E4E9' }}>x</button>
      </div>
      <div style={{ marginBottom: 8, color: '#6e6a86' }}>Type: {context.node.type}</div>
      <div style={{ marginBottom: 8, color: '#6e6a86' }}>Domain: {context.node.domain}</div>
      <div style={{ marginBottom: 12 }}>Connections: {context.connections.length}</div>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Connected To:</div>
      {context.connections.slice(0, 15).map(conn => (
        <div key={conn.node.id} style={{ marginBottom: 4, paddingLeft: 8 }}>
          {conn.node.label} <span style={{ color: '#6e6a86' }}>({conn.edge.label})</span>
        </div>
      ))}
      {context.recentActivity.length > 0 && (
        <>
          <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 8 }}>Activity:</div>
          {context.recentActivity.map((act, i) => (
            <div key={i} style={{ marginBottom: 4, paddingLeft: 8, color: '#6e6a86' }}>
              {act}
            </div>
          ))}
        </>
      )}
    </div>
  );
};

interface TimeSliderProps {
  nodes: VisualizationNode[];
  range: [string, string];
  onChange: (range: [string, string]) => void;
}

export const TimeSlider: React.FC<TimeSliderProps> = ({ nodes, range, onChange }) => {
  const [minDate, maxDate] = useMemo(() => {
    if (nodes.length === 0) return ['', ''];
    const sorted = nodes.map(n => n.createdAt).sort();
    return [sorted[0]!, sorted[sorted.length - 1]!];
  }, [nodes]);

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const minMs = new Date(minDate).getTime();
    const maxMs = new Date(maxDate).getTime();
    const date = new Date(minMs + (val / 100) * (maxMs - minMs)).toISOString();
    onChange([date, range[1]]);
  }, [minDate, maxDate, range, onChange]);

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const minMs = new Date(minDate).getTime();
    const maxMs = new Date(maxDate).getTime();
    const date = new Date(minMs + (val / 100) * (maxMs - minMs)).toISOString();
    onChange([range[0], date]);
  }, [minDate, maxDate, range, onChange]);

  return (
    <div
      data-testid="time-slider"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        background: 'rgba(26, 26, 46, 0.7)',
        borderTop: '1px solid #3a3a5e',
        fontFamily: 'JetBrains Mono, Fira Code, monospace',
        fontSize: 11,
        color: '#6e6a86',
      }}
    >
      <span>Time range:</span>
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        onChange={handleMinChange}
        style={{ flex: 1 }}
        data-testid="time-slider-min"
      />
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={100}
        onChange={handleMaxChange}
        style={{ flex: 1 }}
        data-testid="time-slider-max"
      />
    </div>
  );
};

// ─── Display Graph Builder ──────────────────────────────────────────────────

/**
 * Build the display-ready graph by collapsing/expanding categories.
 * - Collapsed category → single synthetic node (type='category')
 * - Expanded category → entity nodes from that category
 * - Disabled category → removed entirely
 */
export function buildDisplayGraph(
  categoryGraph: VisualizationGraphV2 | null,
  fallbackGraph: VisualizationGraph,
  enabled: Set<VisualizationCategory>,
  expanded: Set<VisualizationCategory>,
): { nodes: VisualizationNode[]; edges: VisualizationEdge[] } {
  if (!categoryGraph) {
    return { nodes: fallbackGraph.nodes, edges: fallbackGraph.edges };
  }

  const nodes: VisualizationNode[] = [];
  const nodeIdSet = new Set<string>();

  // Process each category node
  for (const catNode of categoryGraph.categoryNodes) {
    if (!enabled.has(catNode.category)) continue;

    if (expanded.has(catNode.category)) {
      // Expanded: inject entity nodes
      for (const nodeId of catNode.nodeIds) {
        const entityNode = categoryGraph.nodes.find(n => n.id === nodeId);
        if (entityNode) {
          nodes.push(entityNode);
          nodeIdSet.add(entityNode.id);
        }
      }
    } else {
      // Collapsed: synthetic category node
      const syntheticNode: VisualizationNode = {
        id: catNode.id,
        label: catNode.label,
        type: 'category',
        size: catNode.totalSize,
        createdAt: new Date().toISOString(),
        domain: 'general',
        metadata: {
          category: catNode.category,
          color: catNode.color,
          icon: catNode.icon,
          nodeCount: catNode.nodeCount,
        },
      };
      nodes.push(syntheticNode);
      nodeIdSet.add(catNode.id);
    }
  }

  // Build edges
  const edges: VisualizationEdge[] = [];
  const edgeKeys = new Set<string>();

  // Build category-to-nodeIds lookup for collapsed categories
  const collapsedCatNodeMap = new Map<string, string>(); // entity nodeId → cat node id
  for (const catNode of categoryGraph.categoryNodes) {
    if (!enabled.has(catNode.category) || expanded.has(catNode.category)) continue;
    for (const nid of catNode.nodeIds) {
      collapsedCatNodeMap.set(nid, catNode.id);
    }
  }

  for (const edge of categoryGraph.edges) {
    // Resolve source/target to display graph node IDs
    let srcId = edge.sourceId;
    let tgtId = edge.targetId;

    // If source node is in a collapsed category, redirect to category node
    if (collapsedCatNodeMap.has(srcId)) {
      srcId = collapsedCatNodeMap.get(srcId)!;
    }
    if (collapsedCatNodeMap.has(tgtId)) {
      tgtId = collapsedCatNodeMap.get(tgtId)!;
    }

    // Both endpoints must be in the display graph
    if (!nodeIdSet.has(srcId) || !nodeIdSet.has(tgtId)) continue;

    // Skip self-loops (same collapsed category)
    if (srcId === tgtId) continue;

    const key = [srcId, tgtId].sort().join('::');
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);

    edges.push({
      id: `display_${edge.id}`,
      sourceId: srcId,
      targetId: tgtId,
      weight: edge.weight,
      label: edge.label,
    });
  }

  // Add category-level edges for collapsed↔collapsed pairs
  for (const catEdge of categoryGraph.categoryEdges) {
    if (!nodeIdSet.has(catEdge.sourceCategoryId) || !nodeIdSet.has(catEdge.targetCategoryId)) continue;

    const key = [catEdge.sourceCategoryId, catEdge.targetCategoryId].sort().join('::');
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);

    edges.push({
      id: catEdge.id,
      sourceId: catEdge.sourceCategoryId,
      targetId: catEdge.targetCategoryId,
      weight: catEdge.weight,
      label: `${catEdge.edgeCount} connections`,
    });
  }

  return { nodes, edges };
}

// ─── Main View ──────────────────────────────────────────────────────────────

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  graph,
  categoryGraph,
  onExport,
  onNodeSelect,
  onNavigateToConnections,
  nodeContext,
  width = 1200,
  height = 800,
}) => {
  const [showStats, setShowStats] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[string, string]>(['', '']);
  const [enabledCategories, setEnabledCategories] = useState<Set<VisualizationCategory>>(
    () => new Set(getAllCategories()),
  );
  const [expandedCategories, setExpandedCategories] = useState<Set<VisualizationCategory>>(
    new Set(),
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

  const handleResetFilters = useCallback(() => {
    setEnabledCategories(new Set(getAllCategories()));
  }, []);

  const handleCategoryClick = useCallback((categoryId: string) => {
    const cat = categoryId.replace('cat_', '') as VisualizationCategory;
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  // Build display graph — handles category collapse/expand/filter
  const displayGraph = useMemo(() => {
    return buildDisplayGraph(
      categoryGraph ?? null,
      graph,
      enabledCategories,
      expandedCategories,
    );
  }, [categoryGraph, graph, enabledCategories, expandedCategories]);

  // Filter nodes by time range
  const filteredNodes = useMemo(() => {
    if (!timeRange[0] && !timeRange[1]) return displayGraph.nodes;
    return displayGraph.nodes.filter(n => {
      if (timeRange[0] && n.createdAt < timeRange[0]) return false;
      if (timeRange[1] && n.createdAt > timeRange[1]) return false;
      return true;
    });
  }, [displayGraph.nodes, timeRange]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map(n => n.id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () => displayGraph.edges.filter(e => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId)),
    [displayGraph.edges, filteredNodeIds],
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
  }, []);

  const graphWidth = showFilter ? width - 240 : width;

  return (
    <div
      data-testid="knowledge-graph-view"
      style={{ position: 'relative', width, height: height + 48, background: '#1a1a2e' }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: '1px solid #3a3a5e',
          fontFamily: 'JetBrains Mono, Fira Code, monospace',
          fontSize: 13,
          color: '#E2E4E9',
        }}
      >
        <span style={{ fontWeight: 600 }}>Knowledge Graph</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowFilter(prev => !prev)}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              border: '1px solid #3a3a5e',
              color: '#E2E4E9',
              fontFamily: 'inherit',
              fontSize: 11,
              cursor: 'pointer',
            }}
            data-testid="filter-toggle"
          >
            [Filter]
          </button>
          <button
            onClick={() => setShowStats(prev => !prev)}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              border: '1px solid #3a3a5e',
              color: '#E2E4E9',
              fontFamily: 'inherit',
              fontSize: 11,
              cursor: 'pointer',
            }}
            data-testid="stats-toggle"
          >
            [Stats]
          </button>
          {onExport && (
            <button
              onClick={onExport}
              style={{
                padding: '4px 12px',
                background: 'transparent',
                border: '1px solid #3a3a5e',
                color: '#E2E4E9',
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
              data-testid="export-button"
            >
              [Export]
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Filter Panel */}
        {showFilter && categoryGraph && (
          <FilterPanel
            categories={categoryGraph.categoryNodes}
            enabledCategories={enabledCategories}
            onToggleCategory={handleToggleCategory}
            onResetFilters={handleResetFilters}
          />
        )}

        {/* Graph */}
        <div style={{ flex: 1 }}>
          <ForceGraph
            nodes={filteredNodes}
            edges={filteredEdges}
            clusters={graph.clusters}
            width={graphWidth}
            height={height - 80}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onCategoryClick={handleCategoryClick}
            onNavigateToConnections={onNavigateToConnections}
          />
        </div>
      </div>

      {/* Time Slider */}
      <TimeSlider
        nodes={graph.nodes}
        range={timeRange}
        onChange={setTimeRange}
      />

      {/* Stats Overlay */}
      <StatsOverlay stats={categoryGraph?.stats ?? graph.stats} visible={showStats} />

      {/* Node Detail Panel */}
      {nodeContext && selectedNodeId && (
        <NodeDetailPanel
          context={nodeContext}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
};
