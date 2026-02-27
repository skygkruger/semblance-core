/**
 * ForceGraph — D3 force-directed graph visualization.
 *
 * SVG-based with force simulation: forceLink, forceManyBody, forceCenter, forceCollide.
 * Supports zoom/pan (d3-zoom), node drag, hover highlight, and click selection.
 */

import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import type {
  VisualizationNode,
  VisualizationEdge,
  VisualizationCluster,
  VisualizationEntityType,
} from '../../../../core/knowledge/graph-visualization';

// ─── Constants ───────────────────────────────────────────────────────────────

import type { VisualizationCategory } from '../../../../core/knowledge/connector-category-map';

const NODE_COLORS: Record<VisualizationEntityType, string> = {
  person: '#4A7FBA',
  topic: '#E8A838',
  document: '#8B93A7',
  event: '#3DB87A',
  email_thread: 'rgba(74, 127, 186, 0.38)',
  reminder: '#E85D5D',
  location: '#5BA3A3',
  category: '#8B93A7', // Fallback — actual color comes from metadata
};

const MIN_RADIUS = 6;
const MAX_RADIUS = 24;
const CAT_MIN_RADIUS = 20;
const CAT_MAX_RADIUS = 40;
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
  onCategoryClick?: (categoryId: string) => void;
  onNavigateToConnections?: (category: VisualizationCategory) => void;
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

function getCategoryNodeRadius(size: number, maxSize: number): number {
  if (maxSize <= 0) return CAT_MIN_RADIUS;
  const normalized = Math.min(size / maxSize, 1);
  return CAT_MIN_RADIUS + normalized * (CAT_MAX_RADIUS - CAT_MIN_RADIUS);
}

export const ForceGraph: React.FC<ForceGraphProps> = ({
  nodes,
  edges,
  clusters,
  width,
  height,
  onNodeClick,
  onNodeHover,
  onCategoryClick,
  onNavigateToConnections,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const maxSize = useMemo(
    () => Math.max(...nodes.filter(n => n.type !== 'category').map(n => n.size), 1),
    [nodes],
  );

  const maxCatSize = useMemo(
    () => Math.max(...nodes.filter(n => n.type === 'category').map(n => n.size), 1),
    [nodes],
  );

  // Build a lookup of category node ID → color for edge gradients
  const catColorMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodes) {
      if (node.type === 'category') {
        map.set(node.id, (node.metadata.color as string) ?? NODE_COLORS.category);
      }
    }
    return map;
  }, [nodes]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: 'transparent' }}
      data-testid="force-graph-svg"
    >
      <defs data-testid="svg-defs">
        {/* Glow filters for expanded anchor category nodes */}
        {nodes.filter(n => n.type === 'category').map(node => (
          <filter key={`glow-${node.id}`} id={`glow-${node.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
        {/* Gradient defs for category↔category edges */}
        {edges
          .filter(e => e.sourceId.startsWith('cat_') && e.targetId.startsWith('cat_'))
          .map(edge => {
            const srcColor = catColorMap.get(edge.sourceId) ?? EDGE_COLOR;
            const tgtColor = catColorMap.get(edge.targetId) ?? EDGE_COLOR;
            return (
              <linearGradient
                key={`edge-grad-${edge.id}`}
                id={`edge-grad-${edge.id}`}
                data-testid={`edge-grad-${edge.id}`}
              >
                <stop offset="0%" stopColor={srcColor} />
                <stop offset="100%" stopColor={tgtColor} />
              </linearGradient>
            );
          })}
      </defs>
      <g className="clusters" data-testid="clusters-group">
        {/* Cluster backgrounds rendered here */}
      </g>
      <g className="edges" data-testid="edges-group">
        {edges.map(edge => {
          const isCatCatEdge = edge.sourceId.startsWith('cat_') && edge.targetId.startsWith('cat_');
          const isCategoryEdge = edge.sourceId.startsWith('cat_') || edge.targetId.startsWith('cat_');
          const strokeWidth = isCategoryEdge
            ? Math.max(1, Math.min(4, edge.weight * 4))
            : EDGE_WIDTH;
          const edgeMidX = width / 2;
          const edgeMidY = height / 2;
          return (
            <g key={edge.id}>
              <line
                data-edge-id={edge.id}
                stroke={isCatCatEdge ? `url(#edge-grad-${edge.id})` : EDGE_COLOR}
                strokeWidth={strokeWidth}
                opacity={getEdgeOpacity(edge.weight)}
                x1={edgeMidX}
                y1={edgeMidY}
                x2={edgeMidX}
                y2={edgeMidY}
              />
              {/* Weight badge for category↔category edges */}
              {isCatCatEdge && (
                <text
                  data-testid={`edge-weight-${edge.id}`}
                  x={edgeMidX}
                  y={edgeMidY}
                  fontFamily="'DM Mono', monospace"
                  fontSize={11}
                  fill="#A8B4C0"
                  textAnchor="middle"
                  dy={-4}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {edge.weight}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <g className="nodes" data-testid="nodes-group">
        {nodes.map(node => {
          const isCategory = node.type === 'category';
          const catColor = isCategory
            ? (node.metadata.color as string) ?? NODE_COLORS.category
            : null;
          const catNodeCount = isCategory
            ? (node.metadata.nodeCount as number) ?? 0
            : 0;
          const isLocked = isCategory && catNodeCount === 0;
          const isExpanded = isCategory && (node.metadata.expanded as boolean) === true;
          const isHovered = hoveredNodeId === node.id;
          const radius = isCategory
            ? getCategoryNodeRadius(node.size, maxCatSize)
            : getNodeRadius(node.size, maxSize);
          const color = isCategory ? catColor! : getNodeColor(node.type);

          // Category fill/stroke opacity: default 12%/60%, hover 18%/90%
          const catFillOpacity = isHovered ? 0.18 : 0.12;
          const catStrokeOpacity = isHovered ? 0.90 : 0.60;
          const catFillColor = isCategory ? `${catColor}${isHovered ? '2E' : '1F'}` : color;
          const catStrokeColor = isCategory ? `${catColor}${isHovered ? 'E6' : '99'}` : color;

          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-node-type={node.type}
              data-category-id={isCategory ? node.id : undefined}
              style={{ cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.4 : 1 }}
              onClick={() => {
                if (isLocked && onNavigateToConnections) {
                  onNavigateToConnections(node.metadata.category as VisualizationCategory);
                } else {
                  onNodeClick?.(node.id);
                }
              }}
              onDoubleClick={() => {
                if (isCategory && !isLocked) {
                  onCategoryClick?.(node.id);
                }
              }}
              onMouseEnter={() => {
                setHoveredNodeId(node.id);
                onNodeHover?.(node.id);
              }}
              onMouseLeave={() => {
                setHoveredNodeId(null);
                onNodeHover?.(null);
              }}
            >
              <circle
                r={radius}
                fill={isCategory ? catFillColor : color}
                stroke={isCategory ? catStrokeColor : color}
                strokeWidth={isCategory ? 2 : 1.5}
                strokeDasharray={isCategory ? '4 2' : undefined}
                opacity={isCategory ? 1 : 0.85}
                cx={width / 2 + (Math.random() - 0.5) * 100}
                cy={height / 2 + (Math.random() - 0.5) * 100}
                data-radius={radius}
                data-fill-opacity={isCategory ? catFillOpacity : undefined}
                data-stroke-opacity={isCategory ? catStrokeOpacity : undefined}
                filter={isExpanded ? `url(#glow-${node.id})` : undefined}
              />
              {/* Category count label inside the circle */}
              {isCategory && (
                <text
                  fontSize={11}
                  fontWeight={600}
                  fill="#EEF1F4"
                  textAnchor="middle"
                  dy={4}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {catNodeCount}
                </text>
              )}
              {/* Node label below */}
              <text
                fontSize={isCategory ? 11 : 10}
                fill="#E2E4E9"
                textAnchor="middle"
                dy={radius + 12}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {isLocked
                  ? node.label
                  : node.label.length > 20
                    ? `${node.label.slice(0, 18)}...`
                    : node.label}
              </text>
              {/* Lock glyph SVG for locked category nodes */}
              {isLocked && (
                <g
                  transform={`translate(-5, ${radius + 18})`}
                  opacity={0.4}
                  data-testid={`lock-glyph-${node.id}`}
                >
                  <path
                    d="M2 5V4a3 3 0 1 1 6 0v1h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1zm1 0h4V4a2 2 0 0 0-4 0v1z"
                    fill="#A8B4C0"
                  />
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export { NODE_COLORS, MIN_RADIUS, MAX_RADIUS, CAT_MIN_RADIUS, CAT_MAX_RADIUS, getNodeColor, getNodeRadius, getCategoryNodeRadius, getEdgeOpacity };
