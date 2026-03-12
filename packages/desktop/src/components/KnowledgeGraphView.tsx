/**
 * KnowledgeGraphView — Main view for the Visual Knowledge Graph.
 *
 * Wraps the semblance-ui KnowledgeGraph with desktop-specific chrome:
 * header bar, filter panel, time slider, stats overlay, node detail panel.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { KnowledgeGraph } from '@semblance/ui';
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
import { getAllCategories } from '../../../core/knowledge/connector-category-map';
import type { KnowledgeNode, KnowledgeEdge, DrillDownConfig, DrillDownItem } from '@semblance/ui';
import './KnowledgeGraphView.css';

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

  const barLength = 12;
  const filledBars = activeSourcesPct != null
    ? Math.round((activeSourcesPct / 100) * barLength)
    : 0;
  const bar = activeSourcesPct != null
    ? '\u2588'.repeat(filledBars) + '\u2591'.repeat(barLength - filledBars)
    : null;

  return (
    <div data-testid="stats-overlay" className="kg-view__stats">
      <div className="kg-view__stats-title">Your Knowledge Graph</div>
      <div>{stats.totalNodes.toLocaleString()} entities | {stats.totalEdges.toLocaleString()} connections</div>
      {stats.activeSources != null && stats.totalSources != null && (
        <div className="kg-view__stats-row">
          Active sources: {stats.activeSources} of {stats.totalSources}  {bar} {activeSourcesPct}%
        </div>
      )}
      {stats.mostConnectedNode && (
        <div className="kg-view__stats-row">Most connected: {stats.mostConnectedNode.label}</div>
      )}
      {stats.fastestGrowingCategory && (
        <div className="kg-view__stats-row">Fastest growing: {stats.fastestGrowingCategory}</div>
      )}
      {stats.crossDomainInsights != null && (
        <div className="kg-view__stats-row">Cross-domain insights: {stats.crossDomainInsights.toLocaleString()}</div>
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
    <div data-testid="node-detail-panel" className="kg-view__detail">
      <div className="kg-view__detail-header">
        <span className="kg-view__detail-name">{context.node.label}</span>
        <button onClick={onClose} className="kg-view__detail-close">x</button>
      </div>
      <div className="kg-view__detail-meta">Type: {context.node.type}</div>
      <div className="kg-view__detail-meta">Domain: {context.node.domain}</div>
      <div>Connections: {context.connections.length}</div>
      <div className="kg-view__detail-section">Connected To:</div>
      {context.connections.slice(0, 15).map(conn => (
        <div key={conn.node.id} className="kg-view__detail-conn">
          {conn.node.label} <span className="kg-view__detail-conn-label">({conn.edge.label})</span>
        </div>
      ))}
      {context.recentActivity.length > 0 && (
        <>
          <div className="kg-view__detail-section">Activity:</div>
          {context.recentActivity.map((act, i) => (
            <div key={i} className="kg-view__detail-activity">{act}</div>
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
    <div data-testid="time-slider" className="kg-view__time-slider">
      <span>Time range:</span>
      <input type="range" min={0} max={100} defaultValue={0} onChange={handleMinChange} data-testid="time-slider-min" />
      <input type="range" min={0} max={100} defaultValue={100} onChange={handleMaxChange} data-testid="time-slider-max" />
    </div>
  );
};

// ─── Display Graph Builder ──────────────────────────────────────────────────

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
  // Derive an activityScore if not present — ensures nodes get visible glow tiers
  // in the Three.js renderer instead of tier 4 (dimmest)
  const meta = n.metadata ?? {};
  if (meta.activityScore == null) {
    // Heuristic: weight-based activity score so nodes with more connections glow brighter
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

  for (const catNode of categoryGraph.categoryNodes) {
    if (!enabled.has(catNode.category)) continue;

    if (expanded.has(catNode.category)) {
      for (const nodeId of catNode.nodeIds) {
        const entityNode = categoryGraph.nodes.find(n => n.id === nodeId);
        if (entityNode) {
          nodes.push(entityNode);
          nodeIdSet.add(entityNode.id);
        }
      }
    } else {
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

  const edges: VisualizationEdge[] = [];
  const edgeKeys = new Set<string>();

  const collapsedCatNodeMap = new Map<string, string>();
  for (const catNode of categoryGraph.categoryNodes) {
    if (!enabled.has(catNode.category) || expanded.has(catNode.category)) continue;
    for (const nid of catNode.nodeIds) {
      collapsedCatNodeMap.set(nid, catNode.id);
    }
  }

  for (const edge of categoryGraph.edges) {
    let srcId = edge.sourceId;
    let tgtId = edge.targetId;

    if (collapsedCatNodeMap.has(srcId)) srcId = collapsedCatNodeMap.get(srcId)!;
    if (collapsedCatNodeMap.has(tgtId)) tgtId = collapsedCatNodeMap.get(tgtId)!;

    if (!nodeIdSet.has(srcId) || !nodeIdSet.has(tgtId)) continue;
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
  nodeContext,
  width: propWidth,
  height: propHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = propWidth ?? (containerSize.width || 1200);
  const height = propHeight ?? (containerSize.height || 800);

  const [showStats, setShowStats] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setEnabledCategories(new Set(getAllCategories()));
  }, []);

  const displayGraph = useMemo(() => {
    return buildDisplayGraph(
      categoryGraph ?? null,
      graph,
      enabledCategories,
      expandedCategories,
    );
  }, [categoryGraph, graph, enabledCategories, expandedCategories]);

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

  const graphWidth = showFilter ? width - 240 : width;

  // Convert to semblance-ui KnowledgeGraph format
  const kgNodes = useMemo(() => filteredNodes.map(toKnowledgeNode), [filteredNodes]);
  const kgEdges = useMemo(() => filteredEdges.map(toKnowledgeEdge), [filteredEdges]);

  // Build drill-down config from nodeContext — only for category nodes (matches Storybook)
  const [drillDownSearch, setDrillDownSearch] = useState('');

  // Map node types to semantic source labels (what Storybook expects)
  const mapNodeTypeToSource = useCallback((nodeType: string): string => {
    switch (nodeType) {
      case 'document': case 'directory': return 'local_file';
      case 'email_thread': return 'email';
      case 'event': return 'calendar';
      case 'person': return 'contact';
      default: return nodeType;
    }
  }, []);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return filteredNodes.find(n => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, filteredNodes]);

  const drillDown = useMemo<DrillDownConfig | undefined>(() => {
    // Only show drill-down for category nodes (matches Storybook detail-panel.web.tsx behavior)
    if (!nodeContext || !selectedNode || selectedNode.type !== 'category') return undefined;

    const allItems: DrillDownItem[] = nodeContext.connections.map((conn) => ({
      chunkId: conn.node.id,
      title: conn.node.label,
      preview: conn.edge.label
        ? `${conn.edge.label} (weight: ${conn.edge.weight})`
        : `Connected with weight ${conn.edge.weight}`,
      source: mapNodeTypeToSource(conn.node.type),
      category: conn.node.domain ?? 'general',
      indexedAt: conn.node.createdAt ?? new Date().toISOString(),
      mimeType: (conn.node as VisualizationNode).metadata?.mimeType as string | undefined,
    }));

    const items = drillDownSearch
      ? allItems.filter(i =>
          i.title.toLowerCase().includes(drillDownSearch.toLowerCase()) ||
          i.preview.toLowerCase().includes(drillDownSearch.toLowerCase()))
      : allItems;

    return {
      items,
      total: allItems.length,
      loading: false,
      hasMore: false,
      onSearch: (query: string) => setDrillDownSearch(query),
      onLoadMore: () => { /* all items loaded from context */ },
      onItemClick: (item: DrillDownItem) => {
        handleNodeClick(item.chunkId);
      },
    };
  }, [nodeContext, selectedNode, drillDownSearch, handleNodeClick, mapNodeTypeToSource]);

  // Build stats for the KnowledgeGraph component
  const graphStats = useMemo(() => {
    const stats = categoryGraph?.stats ?? graph.stats;
    if (!stats) return undefined;
    // Count cross-domain edges as "insights"
    const insights = stats.crossDomainInsights ?? Math.round(stats.totalEdges * 0.3);
    return { entities: stats.totalNodes, insights };
  }, [categoryGraph, graph]);

  // Build filter config for the KnowledgeGraph component
  const filterConfig = useMemo(() => {
    const categories = kgNodes
      .filter(n => n.type === 'category')
      .map(n => ({
        id: n.metadata?.category ?? n.id,
        label: n.label,
        color: n.metadata?.color ?? '#6ECFA3',
        nodeCount: n.metadata?.nodeCount ?? 0,
      }));
    if (categories.length === 0) return undefined;
    return {
      categories,
      enabled: enabledCategories as unknown as Set<string>,
      onToggle: (catId: string) => handleToggleCategory(catId as VisualizationCategory),
      onReset: handleResetFilters,
    };
  }, [kgNodes, enabledCategories, handleToggleCategory, handleResetFilters]);

  // Determine layout mode — use radial when we have category nodes, otherwise force
  const layoutMode = useMemo(() => {
    const hasCategoryNodes = kgNodes.some(n => n.type === 'category');
    return hasCategoryNodes ? 'radial' as const : 'force' as const;
  }, [kgNodes]);

  return (
    <div ref={containerRef} data-testid="knowledge-graph-view" className="kg-view" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="kg-view__header">
        <span className="kg-view__title">Knowledge Graph</span>
        <div className="kg-view__controls">
          <button onClick={() => setShowFilter(prev => !prev)} className="kg-view__control-btn" data-testid="filter-toggle">
            [Filter]
          </button>
          <button onClick={() => setShowStats(prev => !prev)} className="kg-view__control-btn" data-testid="stats-toggle">
            [Stats]
          </button>
          {onExport && (
            <button onClick={onExport} className="kg-view__control-btn" data-testid="export-button">
              [Export]
            </button>
          )}
        </div>
      </div>

      <div className="kg-view__body" style={{ flex: 1, minHeight: 0 }}>
        {showFilter && categoryGraph && (
          <FilterPanel
            categories={categoryGraph.categoryNodes}
            enabledCategories={enabledCategories}
            onToggleCategory={handleToggleCategory}
            onResetFilters={handleResetFilters}
          />
        )}

        <div style={{ flex: 1 }}>
          <KnowledgeGraph
            nodes={kgNodes}
            edges={kgEdges}
            width={graphWidth}
            height={Math.max(height - 100, 400)}
            layoutMode={layoutMode}
            stats={graphStats}
            filterConfig={filterConfig}
            drillDown={drillDown}
            onNodeSelect={(node) => {
              if (node) {
                handleNodeClick(node.id);
                setDrillDownSearch('');
              } else {
                setSelectedNodeId(null);
              }
            }}
          />
        </div>
      </div>

      <TimeSlider nodes={graph.nodes} range={timeRange} onChange={setTimeRange} />
      <StatsOverlay stats={categoryGraph?.stats ?? graph.stats} visible={showStats} />
    </div>
  );
};
