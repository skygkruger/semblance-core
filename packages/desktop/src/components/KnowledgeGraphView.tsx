/**
 * KnowledgeGraphView — Main view for the Visual Knowledge Graph.
 *
 * Header with stats/export buttons. ForceGraph in center. Time slider below.
 * Node detail panel (shown on node click).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ForceGraph } from './d3/ForceGraph';
import type {
  VisualizationGraph,
  VisualizationNode,
  GraphStats,
  NodeContext,
} from '../../../core/knowledge/graph-visualization';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KnowledgeGraphViewProps {
  graph: VisualizationGraph;
  onExport?: () => void;
  onNodeSelect?: (nodeId: string) => void;
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
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Graph Statistics</div>
      <div>Nodes: {stats.totalNodes}</div>
      <div>Edges: {stats.totalEdges}</div>
      <div>Avg connections: {stats.averageConnections}</div>
      <div>Density: {(stats.graphDensity * 100).toFixed(2)}%</div>
      <div>New (7d): {stats.growthRate}</div>
      {stats.mostConnectedNode && (
        <div style={{ marginTop: 4 }}>
          Hub: {stats.mostConnectedNode.label} ({stats.mostConnectedNode.connections})
        </div>
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

// ─── Main View ──────────────────────────────────────────────────────────────

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  graph,
  onExport,
  onNodeSelect,
  nodeContext,
  width = 1200,
  height = 800,
}) => {
  const [showStats, setShowStats] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<[string, string]>(['', '']);

  // Filter nodes by time range
  const filteredNodes = useMemo(() => {
    if (!timeRange[0] && !timeRange[1]) return graph.nodes;
    return graph.nodes.filter(n => {
      if (timeRange[0] && n.createdAt < timeRange[0]) return false;
      if (timeRange[1] && n.createdAt > timeRange[1]) return false;
      return true;
    });
  }, [graph.nodes, timeRange]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map(n => n.id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () => graph.edges.filter(e => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId)),
    [graph.edges, filteredNodeIds],
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    onNodeSelect?.(nodeId);
  }, [onNodeSelect]);

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setHoveredNodeId(nodeId);
  }, []);

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

      {/* Graph */}
      <ForceGraph
        nodes={filteredNodes}
        edges={filteredEdges}
        clusters={graph.clusters}
        width={width}
        height={height - 80}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
      />

      {/* Time Slider */}
      <TimeSlider
        nodes={graph.nodes}
        range={timeRange}
        onChange={setTimeRange}
      />

      {/* Stats Overlay */}
      <StatsOverlay stats={graph.stats} visible={showStats} />

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
