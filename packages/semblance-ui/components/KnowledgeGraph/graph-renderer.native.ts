// ─── Skia 2D renderer for KnowledgeGraph — projects 3D positions to 2D ───
// No DOM, no Three.js. Computes projected positions for Skia Canvas primitives.

import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';
import { getNodeRadius, getNodeColorHex } from './graph-physics';

// ─── Scale factor (same as web renderer) ───
const SCALE = 0.25;

// ─── Glow tier computation (matches web) ───
export function computeGlowTier(node: KnowledgeNode): 0 | 1 | 2 | 3 | 4 {
  if (node.type === 'category') return 0;
  const score = node.metadata?.activityScore ?? 0;
  if (score >= 0.75) return 1;
  if (score >= 0.50) return 2;
  if (score >= 0.30) return 3;
  return 4;
}

// ─── Projected node for Skia rendering ───
export interface ProjectedNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  alpha: number;
  label: string;
  type: NodeType;
  glowTier: 0 | 1 | 2 | 3 | 4;
  isPeople: boolean;
}

export interface ProjectedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
  color: string;
}

export interface ProjectionResult {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
}

// ─── People category colors ───
const PEOPLE_CORE_COLOR = '#F5E6C8';
const PEOPLE_GLOW_COLOR = 'rgba(245, 230, 200, 0.3)';

function getProjectedColor(node: KnowledgeNode): string {
  if (node.type === 'person') return PEOPLE_CORE_COLOR;
  if (node.type === 'category' && node.metadata?.color) return node.metadata.color;
  return getNodeColorHex(node.type);
}

// ─── 3D → 2D perspective projection ───
export function projectGraph(
  nodes: KnowledgeNode[],
  edges: KnowledgeEdge[],
  canvasWidth: number,
  canvasHeight: number,
  time: number,
): ProjectionResult {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const fov = 600; // perspective distance

  // Build node map for edge lookups
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Project each node from 3D sim coords to 2D screen coords
  const projectedNodes: ProjectedNode[] = nodes.map(node => {
    const sx = (node.x ?? 0) * SCALE;
    const sy = (node.y ?? 0) * SCALE;
    const sz = (node.z ?? 0) * SCALE;

    // Micro-drift for organic movement (matches web renderer)
    const idx = nodes.indexOf(node);
    const driftX = Math.sin(time * 0.0003 + idx * 1.7) * 0.5;
    const driftY = Math.cos(time * 0.0004 + idx * 2.3) * 0.5;

    const worldX = sx + driftX;
    const worldY = sy + driftY;
    const worldZ = sz;

    // Perspective projection
    const perspScale = fov / (fov + worldZ);
    const screenX = cx + worldX * perspScale;
    const screenY = cy + worldY * perspScale;

    // Depth-based radius scaling
    const baseRadius = getNodeRadius(node) * SCALE;
    const radius = Math.max(2, baseRadius * perspScale);

    // Depth-based alpha: closer = brighter
    const depthNorm = (worldZ + 60) / 120; // normalize -60..60 to 0..1
    const alpha = 0.3 + 0.7 * Math.max(0, Math.min(1, 1 - depthNorm));

    const glowTier = computeGlowTier(node);
    const isPeople = node.type === 'person' || node.metadata?.category === 'people';

    return {
      id: node.id,
      x: screenX,
      y: screenY,
      radius,
      color: getProjectedColor(node),
      alpha,
      label: node.label,
      type: node.type,
      glowTier,
      isPeople,
    };
  });

  // Sort by depth (farthest first) so nearer nodes draw on top
  projectedNodes.sort((a, b) => a.alpha - b.alpha);

  // Project edges
  const projNodeMap = new Map(projectedNodes.map(n => [n.id, n]));
  const projectedEdges: ProjectedEdge[] = [];

  for (const edge of edges) {
    const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
    const src = projNodeMap.get(srcId);
    const tgt = projNodeMap.get(tgtId);
    if (!src || !tgt) continue;

    const alpha = Math.min(src.alpha, tgt.alpha) * 0.4;
    const weight = edge.weight;
    // Brighter edges for stronger connections
    const brightness = Math.min(255, 80 + weight * 20);
    const color = `rgba(${brightness},${brightness},${brightness + 15},${alpha.toFixed(2)})`;

    projectedEdges.push({
      x1: src.x,
      y1: src.y,
      x2: tgt.x,
      y2: tgt.y,
      alpha,
      color,
    });
  }

  return { nodes: projectedNodes, edges: projectedEdges };
}
