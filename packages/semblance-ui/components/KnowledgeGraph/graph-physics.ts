import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceZ,
  forceCollide,
} from 'd3-force-3d';
import type { KnowledgeNode, KnowledgeEdge, NodeType, LayoutMode } from './graph-types';

/** Custom XY centering pull force (forceX/forceY not typed in d3-force-3d). */
function forceCenterPull(strength: number) {
  let simNodes: KnowledgeNode[] = [];
  function force(alpha: number) {
    for (const node of simNodes) {
      if (node.fx != null) continue;
      node.vx = (node.vx ?? 0) - (node.x ?? 0) * strength * alpha;
      node.vy = (node.vy ?? 0) - (node.y ?? 0) * strength * alpha;
    }
  }
  force.initialize = (n: KnowledgeNode[]) => { simNodes = n; };
  return force;
}

export function createSimulation(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
  // Sparse graphs (≤6 nodes) get stronger centering to avoid drifting apart
  const isSparse = nodes.length <= 6;
  const centerStrength = isSparse ? 0.15 : 0.06;

  const simulation = forceSimulation(nodes, 3)
    .force('link', forceLink(edges)
      .id((d: KnowledgeNode) => d.id)
      .distance((d: KnowledgeEdge) => 80 - ((d as { weight: number }).weight * 4))
      .strength(0.15)
    )
    .force('charge', forceManyBody()
      .strength((d: KnowledgeNode) =>
        d.type === 'category' ? -300 - (d.weight * 12) : -150 - (d.weight * 10),
      )
    )
    .force('center', forceCenter(0, 0, 0))
    .force('centerPull', forceCenterPull(centerStrength))
    .force('z', forceZ(0).strength(0.05))
    .force('collide', forceCollide()
      .radius((d: KnowledgeNode) => getNodeRadius(d) + (d.type === 'category' ? 16 : 6))
    )
    .alphaDecay(0.015)
    .velocityDecay(0.35);

  return simulation;
}

export function getNodeRadius(node: KnowledgeNode): number {
  const base: Record<NodeType, number> = {
    person: 14,
    email: 7,
    file: 8,
    calendar: 9,
    topic: 4,
    category: 28,
  };
  // Category nodes size based on nodeCount instead of weight (range 28–52)
  if (node.type === 'category' && node.metadata?.nodeCount) {
    return base.category + Math.min(Math.sqrt(node.metadata.nodeCount) * 4, 24);
  }
  // Activity-based linear scaling when activityScore is present
  const score = node.metadata?.activityScore;
  if (score != null) {
    return base[node.type] + score * 18;
  }
  const weightBonus = Math.min(Math.sqrt(node.weight) * 3, 14);
  return base[node.type] + weightBonus;
}

export function getNodeColor(type: KnowledgeNode['type']): number {
  switch (type) {
    case 'person': return 0x6ECFA3;
    case 'calendar': return 0xC9A85C;
    case 'file': return 0xC8CAD0;
    case 'email': return 0x8593A4;
    case 'topic': return 0x4A5568;
    case 'category': return 0x6ECFA3;
  }
}

export function getNodeColorHex(type: KnowledgeNode['type']): string {
  return '#' + getNodeColor(type).toString(16).padStart(6, '0');
}

// ─── Mobile layout scale ───

export function getMobileLayoutScale(canvasWidth: number): number {
  return canvasWidth <= 600 ? canvasWidth / 800 : 1;
}

// ─── Layout modes ───

export function applyLayout(nodes: KnowledgeNode[], mode: LayoutMode, canvasWidth?: number): void {
  switch (mode) {
    case 'radial':
      applyRadialLayout(nodes, canvasWidth);
      break;
    case 'star':
      applyStarLayout(nodes, canvasWidth);
      break;
    case 'ego':
      applyStarLayout(nodes, canvasWidth);
      break;
    case 'force':
    default:
      break;
  }
}

/** Radial: categories fixed in a tilted ring with Z variance. */
function applyRadialLayout(nodes: KnowledgeNode[], canvasWidth?: number): void {
  const categories = nodes.filter(n => n.type === 'category');
  if (categories.length === 0) return;

  const scale = getMobileLayoutScale(canvasWidth ?? 800);
  const radius = (80 + categories.length * 8) * scale;
  const zAmplitude = 120;
  categories.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / categories.length - Math.PI / 2;
    node.fx = Math.cos(angle) * radius;
    node.fy = Math.sin(angle) * radius;
    node.fz = Math.sin(angle * 1.3 + Math.PI / 4) * zAmplitude;
  });
}

/** Star: categories in outer ring at staggered Z depths, entities cluster near center. */
function applyStarLayout(nodes: KnowledgeNode[], canvasWidth?: number): void {
  const categories = nodes.filter(n => n.type === 'category');
  const entities = nodes.filter(n => n.type !== 'category');

  const scale = getMobileLayoutScale(canvasWidth ?? 800);
  const outerRadius = (100 + categories.length * 6) * scale;
  const zLayerSpacing = 60;
  categories.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / categories.length - Math.PI / 2;
    node.fx = Math.cos(angle) * outerRadius;
    node.fy = Math.sin(angle) * outerRadius;
    const layerIndex = i - Math.floor(categories.length / 2);
    node.fz = layerIndex * zLayerSpacing;
  });

  // Seed entity nodes near center (not fixed — they settle via forces)
  const innerRadius = 30;
  entities.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / Math.max(entities.length, 1);
    node.x = Math.cos(angle) * innerRadius;
    node.y = Math.sin(angle) * innerRadius;
    node.z = 0;
  });
}

/** Clamp node positions to prevent stray outliers (margin 80 sim units). */
export function clampNodePositions(nodes: KnowledgeNode[]): void {
  const maxCoord = 250;
  const maxZ = 200;
  for (const node of nodes) {
    if (node.fx != null) continue; // Don't clamp fixed nodes
    if (node.x != null) node.x = Math.max(-maxCoord, Math.min(maxCoord, node.x));
    if (node.y != null) node.y = Math.max(-maxCoord, Math.min(maxCoord, node.y));
    if (node.z != null) node.z = Math.max(-maxZ, Math.min(maxZ, node.z));
  }
}
