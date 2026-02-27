export type NodeType = 'person' | 'email' | 'file' | 'calendar' | 'topic' | 'category';

export type LayoutMode = 'force' | 'radial' | 'star' | 'ego';

export interface KnowledgeNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  weight: number;
  metadata?: {
    category?: string;
    color?: string;
    nodeCount?: number;
    expanded?: boolean;
    activityScore?: number;
  };
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

export interface CategoryLegendItem {
  id: string;
  label: string;
  color: string;
  nodeCount: number;
  category?: string;
}

export interface KnowledgeGraphProps {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  width?: number;
  height?: number;
  layoutMode?: LayoutMode;
  legendLeftOffset?: number;
  onNodeSelect?: (node: KnowledgeNode | null) => void;
  stats?: { entities: number; insights: number };
  filterConfig?: {
    categories: CategoryLegendItem[];
    enabled: Set<string>;
    onToggle: (id: string) => void;
    onReset: () => void;
  };
  isMobile?: boolean;
}
