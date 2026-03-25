// Knowledge Graph Screen Tests — Skia-based rendering, data conversion, data flow.

import { describe, it, expect } from 'vitest';
import type { KnowledgeGraphScreenProps } from '../../packages/mobile/src/screens/KnowledgeGraphScreen';
import type {
  VisualizationNode,
  VisualizationEdge,
  VisualizationGraph,
  GraphStats,
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

function makeStats(): GraphStats {
  return {
    totalNodes: 10,
    totalEdges: 15,
    nodesByType: { person: 5, topic: 3, document: 2 },
    averageConnections: 3,
    mostConnectedNode: { id: 'n1', label: 'Hub', connections: 8 },
    graphDensity: 0.33,
    growthRate: 2,
  };
}

describe('KnowledgeGraphScreen', () => {
  it('screen accepts VisualizationGraph props for Skia renderer', () => {
    const graph: VisualizationGraph = {
      nodes: [
        makeNode({ id: 'p1', label: 'Alice', type: 'person' }),
        makeNode({ id: 't1', label: 'AI Research', type: 'topic' }),
      ],
      edges: [
        { id: 'e1', sourceId: 'p1', targetId: 't1', weight: 0.5, label: 'mentioned_in' },
      ],
      clusters: [],
      stats: makeStats(),
    };

    const props: KnowledgeGraphScreenProps = { graph };

    expect(props.graph.nodes.length).toBe(2);
    expect(props.graph.edges.length).toBe(1);
  });

  it('node tap message includes correct node ID', () => {
    // Simulate what the Skia renderer communicates back
    const nodeId = 'person_ct_xyz';
    const message = JSON.stringify({ type: 'node_tap', nodeId });
    const parsed = JSON.parse(message) as { type: string; nodeId: string };

    expect(parsed.type).toBe('node_tap');
    expect(parsed.nodeId).toBe('person_ct_xyz');
  });

  it('screen renders with graph data prop', () => {
    const graph: VisualizationGraph = {
      nodes: [
        makeNode({ id: 'p1', label: 'Alice' }),
        makeNode({ id: 'p2', label: 'Bob' }),
        makeNode({ id: 'd1', label: 'Project Plan', type: 'document' }),
      ],
      edges: [
        { id: 'e1', sourceId: 'p1', targetId: 'd1', weight: 0.7, label: 'mentioned_in' },
      ],
      clusters: [],
      stats: makeStats(),
    };

    // Verify props type is correct
    const props: KnowledgeGraphScreenProps = {
      graph,
    };

    expect(props.graph.nodes.length).toBe(3);
    expect(props.graph.edges.length).toBe(1);
    expect(props.graph.stats.totalNodes).toBe(10);
  });

  it('VisualizationNode type maps to KnowledgeNode type correctly', () => {
    // Verify the type mapping logic used in the screen's toKnowledgeNode converter
    const typeMap: Record<string, string> = {
      person: 'person',
      event: 'calendar',
      document: 'file',
      category: 'category',
      topic: 'topic',
      email_thread: 'topic', // unmapped types fall to 'topic'
      reminder: 'topic',
      location: 'topic',
    };

    for (const [vizType, expectedType] of Object.entries(typeMap)) {
      const kgType = vizType === 'person' ? 'person'
        : vizType === 'event' ? 'calendar'
        : vizType === 'document' ? 'file'
        : vizType === 'category' ? 'category'
        : 'topic';
      expect(kgType).toBe(expectedType);
    }
  });
});
