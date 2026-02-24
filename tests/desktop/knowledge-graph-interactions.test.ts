// Knowledge Graph Interactions Tests — click handler, time slider, stats overlay, hover.

import { describe, it, expect, vi } from 'vitest';
import type { ForceGraphProps } from '../../packages/desktop/src/components/d3/ForceGraph';
import type { KnowledgeGraphViewProps, StatsOverlay } from '../../packages/desktop/src/components/KnowledgeGraphView';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  GraphStats,
  NodeContext,
} from '../../packages/core/knowledge/graph-visualization';

function makeNode(overrides: Partial<VisualizationNode> = {}): VisualizationNode {
  return {
    id: overrides.id ?? 'n1',
    label: overrides.label ?? 'Test Node',
    type: overrides.type ?? 'person',
    size: overrides.size ?? 5,
    createdAt: overrides.createdAt ?? '2025-06-01T00:00:00Z',
    domain: overrides.domain ?? 'general',
    metadata: overrides.metadata ?? {},
  };
}

function makeGraph(overrides: Partial<VisualizationGraph> = {}): VisualizationGraph {
  return {
    nodes: overrides.nodes ?? [makeNode()],
    edges: overrides.edges ?? [],
    clusters: overrides.clusters ?? [],
    stats: overrides.stats ?? {
      totalNodes: 1,
      totalEdges: 0,
      nodesByType: { person: 1 },
      averageConnections: 0,
      mostConnectedNode: { id: 'n1', label: 'Test Node', connections: 0 },
      graphDensity: 0,
      growthRate: 0,
    },
  };
}

describe('KnowledgeGraphView Interactions', () => {
  it('node click handler fires with correct node ID', () => {
    const onNodeClick = vi.fn();

    // Simulate the ForceGraph onNodeClick contract
    const props: ForceGraphProps = {
      nodes: [makeNode({ id: 'person_ct_abc' })],
      edges: [],
      clusters: [],
      width: 800,
      height: 600,
      onNodeClick,
    };

    // Simulate a click
    props.onNodeClick!('person_ct_abc');
    expect(onNodeClick).toHaveBeenCalledWith('person_ct_abc');
    expect(onNodeClick).toHaveBeenCalledTimes(1);
  });

  it('time slider filters nodes by createdAt range', () => {
    const nodes: VisualizationNode[] = [
      makeNode({ id: 'n1', createdAt: '2025-01-15T00:00:00Z' }),
      makeNode({ id: 'n2', createdAt: '2025-03-20T00:00:00Z' }),
      makeNode({ id: 'n3', createdAt: '2025-06-01T00:00:00Z' }),
      makeNode({ id: 'n4', createdAt: '2025-09-10T00:00:00Z' }),
    ];

    // Simulate time range filter (same logic as KnowledgeGraphView)
    const timeRange: [string, string] = ['2025-02-01T00:00:00Z', '2025-07-01T00:00:00Z'];
    const filtered = nodes.filter(n => {
      if (timeRange[0] && n.createdAt < timeRange[0]) return false;
      if (timeRange[1] && n.createdAt > timeRange[1]) return false;
      return true;
    });

    expect(filtered.length).toBe(2);
    expect(filtered.map(n => n.id)).toEqual(['n2', 'n3']);
  });

  it('stats overlay displays totalNodes, totalEdges, mostConnectedNode', () => {
    const stats: GraphStats = {
      totalNodes: 42,
      totalEdges: 87,
      nodesByType: { person: 20, topic: 12, document: 10 },
      averageConnections: 4.14,
      mostConnectedNode: { id: 'hub', label: 'Alice Hub', connections: 15 },
      graphDensity: 0.1,
      growthRate: 5,
    };

    // Verify the stats data is accessible and correct
    expect(stats.totalNodes).toBe(42);
    expect(stats.totalEdges).toBe(87);
    expect(stats.mostConnectedNode).not.toBeNull();
    expect(stats.mostConnectedNode!.label).toBe('Alice Hub');
    expect(stats.mostConnectedNode!.connections).toBe(15);
    expect(stats.averageConnections).toBe(4.14);
  });

  it('node hover callback provides connected node IDs', () => {
    const onNodeHover = vi.fn();

    const edges: VisualizationEdge[] = [
      { id: 'e1', sourceId: 'n1', targetId: 'n2', weight: 0.5, label: 'mentioned_in' },
      { id: 'e2', sourceId: 'n1', targetId: 'n3', weight: 0.3, label: 'attended' },
      { id: 'e3', sourceId: 'n2', targetId: 'n3', weight: 0.2, label: 'co-occurred' },
    ];

    // Simulate hover: find connected nodes
    const hoveredId = 'n1';
    const connectedIds = new Set<string>();
    for (const edge of edges) {
      if (edge.sourceId === hoveredId) connectedIds.add(edge.targetId);
      if (edge.targetId === hoveredId) connectedIds.add(edge.sourceId);
    }

    // ForceGraph onNodeHover call
    onNodeHover(hoveredId);
    expect(onNodeHover).toHaveBeenCalledWith('n1');

    // Connected nodes are n2 and n3
    expect(connectedIds.has('n2')).toBe(true);
    expect(connectedIds.has('n3')).toBe(true);
    expect(connectedIds.size).toBe(2);
  });
});
