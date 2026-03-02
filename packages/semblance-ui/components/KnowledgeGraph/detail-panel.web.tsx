import { useTranslation } from 'react-i18next';
import type { KnowledgeNode, KnowledgeEdge, NodeType } from './graph-types';
import './detail-panel.css';

interface DetailPanelProps {
  node: KnowledgeNode | null;
  edges: KnowledgeEdge[];
  allNodes: KnowledgeNode[];
  onClose: () => void;
  onConnectionClick?: (nodeId: string) => void;
}

function getConnections(
  nodeId: string,
  edges: KnowledgeEdge[],
  allNodes: KnowledgeNode[],
): { node: KnowledgeNode; weight: number }[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const connections: { node: KnowledgeNode; weight: number }[] = [];

  for (const edge of edges) {
    const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
    const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;

    if (srcId === nodeId) {
      const target = nodeMap.get(tgtId);
      if (target) connections.push({ node: target, weight: edge.weight });
    } else if (tgtId === nodeId) {
      const source = nodeMap.get(srcId);
      if (source) connections.push({ node: source, weight: edge.weight });
    }
  }

  return connections.sort((a, b) => b.weight - a.weight);
}

const DOT_COLORS: Record<NodeType, string> = {
  person: '#6ECFA3',
  calendar: '#C9A85C',
  file: '#C8CAD0',
  email: '#8593A4',
  topic: '#4A5568',
  category: '#6ECFA3',
};

export function DetailPanel({ node, edges, allNodes, onClose, onConnectionClick }: DetailPanelProps) {
  const { t } = useTranslation();

  if (!node) {
    return <div className="kg-detail-panel" />;
  }

  const connections = getConnections(node.id, edges, allNodes);

  return (
    <div className="kg-detail-panel kg-detail-panel--open">
      <div className="kg-detail-panel__header">
        <div>
          <h3 className="kg-detail-panel__title">
            <span
              className={`kg-detail-panel__dot kg-detail-panel__conn-dot--${node.type}`}
              style={{
                backgroundColor: node.type === 'category' && node.metadata?.color
                  ? node.metadata.color
                  : DOT_COLORS[node.type],
              }}
            />
            {node.label}
          </h3>
          <div className="kg-detail-panel__type">
            {node.type === 'category' && node.metadata?.category
              ? node.metadata.category
              : node.type}
          </div>
          {node.sublabel && (
            <div className="kg-detail-panel__sublabel">{node.sublabel}</div>
          )}
        </div>
        <button className="kg-detail-panel__close" onClick={onClose} aria-label={t('a11y.close_panel')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {connections.length > 0 && (
        <>
          <div className="kg-detail-panel__section-label">
            Connections ({connections.length})
          </div>
          <ul className="kg-detail-panel__connections">
            {connections.map(conn => (
              <li
                key={conn.node.id}
                className="kg-detail-panel__connection"
                onClick={() => onConnectionClick?.(conn.node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onConnectionClick?.(conn.node.id);
                  }
                }}
              >
                <span className={`kg-detail-panel__conn-dot kg-detail-panel__conn-dot--${conn.node.type}`} />
                <span className="kg-detail-panel__connection-label">{conn.node.label}</span>
                <span className="kg-detail-panel__connection-weight">{conn.weight}</span>
                <span className="kg-detail-panel__connection-arrow">&rsaquo;</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
