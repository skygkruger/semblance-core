import { useState, useMemo } from 'react';
import './KnowledgeGraph.css';

type NodeType = 'people' | 'topics' | 'documents' | 'events';

interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
}

interface GraphEdge {
  source: string;
  target: string;
}

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  className?: string;
}

const nodeColors: Record<NodeType, string> = {
  people: 'var(--v)',
  topics: 'var(--amber)',
  documents: 'var(--sv3)',
  events: 'var(--w-dim)',
};

export function KnowledgeGraph({
  nodes,
  edges,
  width = 600,
  height = 400,
  className = '',
}: KnowledgeGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const connectedEdges = useMemo(() => {
    if (!hoveredId) return new Set<number>();
    const set = new Set<number>();
    edges.forEach((edge, i) => {
      if (edge.source === hoveredId || edge.target === hoveredId) {
        set.add(i);
      }
    });
    return set;
  }, [hoveredId, edges]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>();
    nodes.forEach(n => map.set(n.id, n));
    return map;
  }, [nodes]);

  return (
    <div className={`knowledge-graph ${className}`.trim()} style={{ width, height }}>
      <svg className="knowledge-graph__svg" viewBox={`0 0 ${width} ${height}`}>
        {edges.map((edge, i) => {
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target) return null;
          return (
            <line
              key={`e-${i}`}
              className={`knowledge-graph__edge ${connectedEdges.has(i) ? 'knowledge-graph__edge--highlighted' : ''}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
          );
        })}
        {nodes.map(node => (
          <g key={node.id}>
            <circle
              className="knowledge-graph__node"
              cx={node.x}
              cy={node.y}
              r={hoveredId === node.id ? 8 : 5}
              fill={nodeColors[node.type]}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
            />
            {hoveredId === node.id && (
              <text
                className="knowledge-graph__label"
                x={node.x}
                y={node.y - 14}
              >
                {node.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
