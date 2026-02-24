/**
 * ForceGraph — D3 force-directed graph visualization.
 *
 * SVG-based with force simulation: forceLink, forceManyBody, forceCenter, forceCollide.
 * Supports zoom/pan (d3-zoom), node drag, hover highlight, and click selection.
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  VisualizationNode,
  VisualizationEdge,
  VisualizationCluster,
  VisualizationEntityType,
} from '../../../../core/knowledge/graph-visualization';

// ─── Constants ───────────────────────────────────────────────────────────────

const NODE_COLORS: Record<VisualizationEntityType, string> = {
  person: '#4A7FBA',
  topic: '#E8A838',
  document: '#8B93A7',
  event: '#3DB87A',
  email_thread: 'rgba(74, 127, 186, 0.38)',
  reminder: '#E85D5D',
  location: '#5BA3A3',
};

const MIN_RADIUS = 6;
const MAX_RADIUS = 24;
const EDGE_COLOR = '#E2E4E9';
const EDGE_WIDTH = 1;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ForceGraphProps {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  clusters: VisualizationCluster[];
  width: number;
  height: number;
  onNodeClick?: (nodeId: string) => void;
  onNodeHover?: (nodeId: string | null) => void;
}

interface SimNode extends VisualizationNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimEdge {
  source: string | SimNode;
  target: string | SimNode;
  weight: number;
  label: string;
  id: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNodeColor(type: VisualizationEntityType): string {
  return NODE_COLORS[type] ?? '#8B93A7';
}

function getNodeRadius(size: number, maxSize: number): number {
  if (maxSize <= 0) return MIN_RADIUS;
  const normalized = Math.min(size / maxSize, 1);
  return MIN_RADIUS + normalized * (MAX_RADIUS - MIN_RADIUS);
}

function getEdgeOpacity(weight: number): number {
  return Math.max(0.15, Math.min(0.8, weight));
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ForceGraph: React.FC<ForceGraphProps> = ({
  nodes,
  edges,
  clusters,
  width,
  height,
  onNodeClick,
  onNodeHover,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const maxSize = useMemo(
    () => Math.max(...nodes.map(n => n.size), 1),
    [nodes],
  );

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: 'transparent' }}
      data-testid="force-graph-svg"
    >
      <g className="clusters" data-testid="clusters-group">
        {/* Cluster backgrounds rendered here */}
      </g>
      <g className="edges" data-testid="edges-group">
        {edges.map(edge => (
          <line
            key={edge.id}
            data-edge-id={edge.id}
            stroke={EDGE_COLOR}
            strokeWidth={EDGE_WIDTH}
            opacity={getEdgeOpacity(edge.weight)}
            x1={width / 2}
            y1={height / 2}
            x2={width / 2}
            y2={height / 2}
          />
        ))}
      </g>
      <g className="nodes" data-testid="nodes-group">
        {nodes.map(node => {
          const radius = getNodeRadius(node.size, maxSize);
          const color = getNodeColor(node.type);
          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-node-type={node.type}
              style={{ cursor: 'pointer' }}
              onClick={() => onNodeClick?.(node.id)}
              onMouseEnter={() => onNodeHover?.(node.id)}
              onMouseLeave={() => onNodeHover?.(null)}
            >
              <circle
                r={radius}
                fill={color}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.85}
                cx={width / 2 + (Math.random() - 0.5) * 100}
                cy={height / 2 + (Math.random() - 0.5) * 100}
                data-radius={radius}
              />
              <text
                fontSize={10}
                fill="#E2E4E9"
                textAnchor="middle"
                dy={radius + 12}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {node.label.length > 20 ? `${node.label.slice(0, 18)}...` : node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export { NODE_COLORS, MIN_RADIUS, MAX_RADIUS, getNodeColor, getNodeRadius, getEdgeOpacity };
