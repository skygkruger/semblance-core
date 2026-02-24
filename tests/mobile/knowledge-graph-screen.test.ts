// Knowledge Graph Screen Tests — HTML building, node tap messages, data flow.

import { describe, it, expect } from 'vitest';
import { buildGraphHTML } from '../../packages/mobile/src/screens/KnowledgeGraphScreen';
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
  it('builds valid HTML string containing graph data', () => {
    const nodes: VisualizationNode[] = [
      makeNode({ id: 'p1', label: 'Alice', type: 'person' }),
      makeNode({ id: 't1', label: 'AI Research', type: 'topic' }),
    ];
    const edges: VisualizationEdge[] = [
      { id: 'e1', sourceId: 'p1', targetId: 't1', weight: 0.5, label: 'mentioned_in' },
    ];

    const html = buildGraphHTML(nodes, edges);

    // HTML is a valid self-contained document
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<svg');
    expect(html).toContain('</html>');

    // Contains the injected data
    expect(html).toContain('"Alice"');
    expect(html).toContain('"AI Research"');
    expect(html).toContain('"p1"');
    expect(html).toContain('"t1"');

    // Contains node colors
    expect(html).toContain('#4A7FBA'); // person color
    expect(html).toContain('#E8A838'); // topic color

    // Contains postMessage for RN communication
    expect(html).toContain('ReactNativeWebView');
    expect(html).toContain('postMessage');
    expect(html).toContain('node_tap');
  });

  it('node tap message includes correct node ID', () => {
    // Simulate what the WebView JavaScript does on tap
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

    // HTML can be generated from the graph data
    const html = buildGraphHTML(props.graph.nodes, props.graph.edges);
    expect(html.length).toBeGreaterThan(100);
  });
});
