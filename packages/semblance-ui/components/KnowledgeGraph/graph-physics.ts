import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceZ,
  forceCollide,
} from 'd3-force-3d';
import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';

export function createSimulation(nodes: KnowledgeNode[], edges: KnowledgeEdge[]) {
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
  // Category nodes size based on nodeCount instead of weight
  if (node.type === 'category' && node.metadata?.nodeCount) {
    return base.category + Math.min(Math.sqrt(node.metadata.nodeCount) * 3, 14);
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
