export type NodeType = 'person' | 'email' | 'file' | 'calendar' | 'topic';

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  weight: number;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
}

export interface KnowledgeEdge {
  source: string | KnowledgeNode;
  target: string | KnowledgeNode;
  weight: number;
}

export interface KnowledgeGraphProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  width?: number;
  height?: number;
  onNodeSelect?: (node: KnowledgeNode | null) => void;
}
