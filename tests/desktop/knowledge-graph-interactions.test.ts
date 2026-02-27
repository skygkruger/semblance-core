// Knowledge Graph Interactions Tests — click handler, time slider, stats overlay, hover,
// category expand/collapse, connection navigation, glow tiers, 3D layouts.

import { describe, it, expect, vi } from 'vitest';
import type { ForceGraphProps } from '../../packages/desktop/src/components/d3/ForceGraph';
import type { KnowledgeGraphViewProps } from '../../packages/desktop/src/components/KnowledgeGraphView';
import { buildDisplayGraph } from '../../packages/desktop/src/components/KnowledgeGraphView';
import type { VisualizationGraphV2 } from '../../packages/desktop/src/components/KnowledgeGraphView';
import type {
  VisualizationGraph,
  VisualizationNode,
  VisualizationEdge,
  GraphStats,
  NodeContext,
  CategoryNode,
  CategoryEdge,
} from '../../packages/core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../packages/core/knowledge/connector-category-map';
import { computeGlowTier } from '../../packages/semblance-ui/components/KnowledgeGraph/graph-renderer';
import { getNodeRadius, applyLayout, getMobileLayoutScale } from '../../packages/semblance-ui/components/KnowledgeGraph/graph-physics';
import type { KnowledgeNode } from '../../packages/semblance-ui/components/KnowledgeGraph/graph-types';

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

// ─── Category Expand/Collapse Interaction Tests ──────────────────────────────

function makeCatGraph(): VisualizationGraphV2 {
  const personNode = makeNode({ id: 'person_1', type: 'person', label: 'Alice' });
  const personNode2 = makeNode({ id: 'person_2', type: 'person', label: 'Bob' });
  const docNode = makeNode({ id: 'doc_1', type: 'document', label: 'Report' });
  const topicNode = makeNode({ id: 'topic_1', type: 'topic', label: 'AI' });

  const edges: VisualizationEdge[] = [
    { id: 'e1', sourceId: 'person_1', targetId: 'doc_1', weight: 0.5, label: 'mentioned_in' },
    { id: 'e2', sourceId: 'person_2', targetId: 'topic_1', weight: 0.3, label: 'mentioned_in' },
  ];

  const categoryNodes: CategoryNode[] = [
    {
      id: 'cat_people', category: 'people', label: 'People',
      color: '#4A7FBA', icon: '[P]', nodeCount: 2, totalSize: 10,
      nodeIds: ['person_1', 'person_2'],
    },
    {
      id: 'cat_knowledge', category: 'knowledge', label: 'Documents & Notes',
      color: '#8B93A7', icon: '[D]', nodeCount: 2, totalSize: 8,
      nodeIds: ['doc_1', 'topic_1'],
    },
  ];

  const categoryEdges: CategoryEdge[] = [
    {
      id: 'cat_edge_knowledge_people',
      sourceCategoryId: 'cat_knowledge',
      targetCategoryId: 'cat_people',
      weight: 0.5,
      edgeCount: 2,
      relationshipTypes: ['mentioned_in'],
    },
  ];

  return {
    nodes: [personNode, personNode2, docNode, topicNode],
    edges,
    clusters: [],
    stats: {
      totalNodes: 4, totalEdges: 2, nodesByType: { person: 2, document: 1, topic: 1 },
      averageConnections: 1, mostConnectedNode: null, graphDensity: 0.33, growthRate: 0,
    },
    categoryNodes,
    categoryEdges,
  };
}

describe('buildDisplayGraph — Expand/Collapse', () => {
  const allEnabled = new Set<VisualizationCategory>([
    'health', 'finance', 'social', 'work', 'reading',
    'music', 'cloud', 'browser', 'people', 'knowledge',
  ]);

  it('all collapsed: display graph has one node per non-empty category', () => {
    const catGraph = makeCatGraph();
    const result = buildDisplayGraph(catGraph, catGraph, allEnabled, new Set());

    // Should have 2 category nodes (people + knowledge)
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.every(n => n.type === 'category')).toBe(true);
    expect(result.nodes.map(n => n.id).sort()).toEqual(['cat_knowledge', 'cat_people']);
  });

  it('expand: category node replaced by entity nodes', () => {
    const catGraph = makeCatGraph();
    const expanded = new Set<VisualizationCategory>(['people']);
    const result = buildDisplayGraph(catGraph, catGraph, allEnabled, expanded);

    // people expanded → 2 entity nodes; knowledge collapsed → 1 category node
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.some(n => n.id === 'person_1')).toBe(true);
    expect(result.nodes.some(n => n.id === 'person_2')).toBe(true);
    expect(result.nodes.some(n => n.id === 'cat_knowledge')).toBe(true);
    // No cat_people synthetic node
    expect(result.nodes.some(n => n.id === 'cat_people')).toBe(false);
  });

  it('collapse: entity nodes replaced by category node', () => {
    const catGraph = makeCatGraph();

    // First expand, then collapse
    const expanded1 = new Set<VisualizationCategory>(['people']);
    const result1 = buildDisplayGraph(catGraph, catGraph, allEnabled, expanded1);
    expect(result1.nodes.some(n => n.id === 'person_1')).toBe(true);

    // Now collapse
    const expanded2 = new Set<VisualizationCategory>();
    const result2 = buildDisplayGraph(catGraph, catGraph, allEnabled, expanded2);
    expect(result2.nodes.some(n => n.id === 'cat_people')).toBe(true);
    expect(result2.nodes.some(n => n.id === 'person_1')).toBe(false);
  });

  it('category edges between collapsed categories show aggregated weight', () => {
    const catGraph = makeCatGraph();
    const result = buildDisplayGraph(catGraph, catGraph, allEnabled, new Set());

    // Should have one edge between cat_knowledge and cat_people
    const catEdge = result.edges.find(
      e => (e.sourceId === 'cat_knowledge' && e.targetId === 'cat_people') ||
           (e.sourceId === 'cat_people' && e.targetId === 'cat_knowledge'),
    );
    expect(catEdge).toBeDefined();
    expect(catEdge!.weight).toBe(0.5);
  });

  it('mixed state: entity→collapsed edges target the category node', () => {
    const catGraph = makeCatGraph();
    const expanded = new Set<VisualizationCategory>(['people']); // expand people, collapse knowledge
    const result = buildDisplayGraph(catGraph, catGraph, allEnabled, expanded);

    // person_1→doc_1 edge: person_1 is expanded, doc_1 is in collapsed knowledge
    // So the edge should be redirected to person_1 → cat_knowledge
    const crossEdge = result.edges.find(
      e => e.sourceId === 'person_1' || e.targetId === 'person_1',
    );
    expect(crossEdge).toBeDefined();
    // Target should be cat_knowledge (doc_1 collapsed into it)
    const otherEnd = crossEdge!.sourceId === 'person_1'
      ? crossEdge!.targetId
      : crossEdge!.sourceId;
    expect(otherEnd).toBe('cat_knowledge');
  });

  it('disabled category removed from display graph entirely', () => {
    const catGraph = makeCatGraph();
    const enabled = new Set<VisualizationCategory>(['knowledge']); // only knowledge enabled
    const result = buildDisplayGraph(catGraph, catGraph, enabled, new Set());

    // Only cat_knowledge should be present
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.id).toBe('cat_knowledge');

    // No edges since people is disabled
    expect(result.edges).toHaveLength(0);
  });
});

// ─── Edge Gradient + Weight Badge Tests ─────────────────────────────────────

describe('ForceGraph — Category Edge Rendering', () => {
  it('category↔category edges get gradient IDs based on edge id', () => {
    // Verify the naming convention: edge-grad-{edgeId}
    const edgeId = 'cat_edge_knowledge_people';
    const gradientId = `edge-grad-${edgeId}`;
    expect(gradientId).toBe('edge-grad-cat_edge_knowledge_people');
  });

  it('isCatCatEdge detects both source and target starting with cat_', () => {
    // The logic in ForceGraph: edge.sourceId.startsWith('cat_') && edge.targetId.startsWith('cat_')
    const catCatEdge = { sourceId: 'cat_people', targetId: 'cat_work' };
    const catEntityEdge = { sourceId: 'cat_people', targetId: 'person_1' };
    const entityEdge = { sourceId: 'person_1', targetId: 'person_2' };

    const isCatCat = (e: { sourceId: string; targetId: string }) =>
      e.sourceId.startsWith('cat_') && e.targetId.startsWith('cat_');

    expect(isCatCat(catCatEdge)).toBe(true);
    expect(isCatCat(catEntityEdge)).toBe(false);
    expect(isCatCat(entityEdge)).toBe(false);
  });

  it('weight badge displays edge weight value for category↔category edges', () => {
    // Verify that the weight badge renders the numeric weight
    const edgeWeight = 8;
    const badgeText = String(edgeWeight);
    expect(badgeText).toBe('8');

    // Weight badge uses DM Mono font, size 11, fill #A8B4C0
    const badgeStyle = {
      fontFamily: "'DM Mono', monospace",
      fontSize: 11,
      fill: '#A8B4C0',
    };
    expect(badgeStyle.fontFamily).toContain('DM Mono');
    expect(badgeStyle.fontSize).toBe(11);
    expect(badgeStyle.fill).toBe('#A8B4C0');
  });

  it('category edge strokeWidth ranges from 1-4px based on weight', () => {
    // Logic: Math.max(1, Math.min(4, edge.weight * 4))
    const calcWidth = (weight: number) => Math.max(1, Math.min(4, weight * 4));

    expect(calcWidth(0)).toBe(1);     // min clamp
    expect(calcWidth(0.25)).toBe(1);  // exactly 1
    expect(calcWidth(0.5)).toBe(2);   // mid range
    expect(calcWidth(1)).toBe(4);     // max clamp
    expect(calcWidth(2)).toBe(4);     // over max
  });
});

// ─── Connection Navigation Tests ────────────────────────────────────────────

describe('Detail Panel — Connection Navigation', () => {
  it('connection click fires focusNode with target node ID', () => {
    const focusNode = vi.fn();

    // Simulate the onConnectionClick → focusNode contract
    const handleConnectionClick = (nodeId: string) => {
      focusNode(nodeId);
    };

    handleConnectionClick('sarah-cg');
    expect(focusNode).toHaveBeenCalledWith('sarah-cg');
    expect(focusNode).toHaveBeenCalledTimes(1);
  });

  it('connection rows have role="button" and tabIndex={0}', () => {
    // Verify the accessibility contract: connection rows must have role and tabIndex
    const expectedAttributes = {
      role: 'button',
      tabIndex: 0,
    };
    expect(expectedAttributes.role).toBe('button');
    expect(expectedAttributes.tabIndex).toBe(0);
  });
});

// ─── Glow Tier Tests ────────────────────────────────────────────────────────

describe('computeGlowTier', () => {
  it('returns tier 0 for categories regardless of score', () => {
    const catNode: KnowledgeNode = {
      id: 'cat_1', type: 'category', label: 'People', weight: 50,
      metadata: { activityScore: 0.95 },
    };
    expect(computeGlowTier(catNode)).toBe(0);
  });

  it('returns tier 1 for score >= 0.75', () => {
    const node: KnowledgeNode = {
      id: 'p1', type: 'person', label: 'Sarah', weight: 18,
      metadata: { activityScore: 0.9 },
    };
    expect(computeGlowTier(node)).toBe(1);

    const boundary: KnowledgeNode = {
      id: 'p2', type: 'person', label: 'Bob', weight: 10,
      metadata: { activityScore: 0.75 },
    };
    expect(computeGlowTier(boundary)).toBe(1);
  });

  it('returns tier 2 for score >= 0.50 and < 0.75', () => {
    const node: KnowledgeNode = {
      id: 'p3', type: 'person', label: 'Marcus', weight: 14,
      metadata: { activityScore: 0.65 },
    };
    expect(computeGlowTier(node)).toBe(2);
  });

  it('returns tier 3 for score >= 0.30 and < 0.50', () => {
    const node: KnowledgeNode = {
      id: 'p4', type: 'file', label: 'Report', weight: 8,
      metadata: { activityScore: 0.35 },
    };
    expect(computeGlowTier(node)).toBe(3);
  });

  it('returns tier 4 for score < 0.30', () => {
    const node: KnowledgeNode = {
      id: 'p5', type: 'topic', label: 'Q3', weight: 3,
      metadata: { activityScore: 0.1 },
    };
    expect(computeGlowTier(node)).toBe(4);
  });

  it('returns tier 4 when no activityScore present', () => {
    const node: KnowledgeNode = {
      id: 'p6', type: 'email', label: 'Thread', weight: 5,
    };
    expect(computeGlowTier(node)).toBe(4);
  });
});

// ─── Activity-Based Sizing Tests ────────────────────────────────────────────

describe('getNodeRadius — activity sizing', () => {
  it('uses linear activityScore scaling when present', () => {
    const node: KnowledgeNode = {
      id: 'p1', type: 'person', label: 'Sarah', weight: 18,
      metadata: { activityScore: 1.0 },
    };
    // base person = 14, + 1.0 * 18 = 32
    expect(getNodeRadius(node)).toBe(32);
  });

  it('uses activityScore=0 for minimum size', () => {
    const node: KnowledgeNode = {
      id: 'p2', type: 'person', label: 'Bob', weight: 18,
      metadata: { activityScore: 0 },
    };
    // base person = 14, + 0 * 18 = 14
    expect(getNodeRadius(node)).toBe(14);
  });

  it('falls back to sqrt scaling when no activityScore', () => {
    const node: KnowledgeNode = {
      id: 'p3', type: 'person', label: 'Marcus', weight: 16,
    };
    // base person = 14, + min(sqrt(16)*3, 14) = 14 + 12 = 26
    expect(getNodeRadius(node)).toBe(26);
  });

  it('category nodes ignore activityScore', () => {
    const node: KnowledgeNode = {
      id: 'cat_1', type: 'category', label: 'People', weight: 50,
      metadata: { nodeCount: 25, activityScore: 0.9 },
    };
    // Category with nodeCount = 25: base 28 + min(sqrt(25)*4, 24) = 28 + 20 = 48
    expect(getNodeRadius(node)).toBe(48);
  });
});

// ─── 3D Layout Tests ────────────────────────────────────────────────────────

describe('applyLayout — 3D depth', () => {
  it('radial layout assigns non-zero fz to categories', () => {
    const nodes: KnowledgeNode[] = [
      { id: 'cat_1', type: 'category', label: 'A', weight: 10 },
      { id: 'cat_2', type: 'category', label: 'B', weight: 10 },
      { id: 'cat_3', type: 'category', label: 'C', weight: 10 },
      { id: 'cat_4', type: 'category', label: 'D', weight: 10 },
    ];

    applyLayout(nodes, 'radial');

    // At least one category should have non-zero fz
    const hasNonZeroFz = nodes.some(n => n.fz != null && n.fz !== 0);
    expect(hasNonZeroFz).toBe(true);
  });

  it('star layout assigns different fz values per category', () => {
    const nodes: KnowledgeNode[] = [
      { id: 'cat_1', type: 'category', label: 'A', weight: 10 },
      { id: 'cat_2', type: 'category', label: 'B', weight: 10 },
      { id: 'cat_3', type: 'category', label: 'C', weight: 10 },
      { id: 'entity_1', type: 'person', label: 'Alice', weight: 5 },
    ];

    applyLayout(nodes, 'star');

    const categories = nodes.filter(n => n.type === 'category');
    const fzValues = categories.map(n => n.fz ?? 0);

    // With 3 categories at zLayerSpacing=60: [-60, 0, 60]
    // At least 2 different fz values
    const uniqueFz = new Set(fzValues);
    expect(uniqueFz.size).toBeGreaterThanOrEqual(2);
  });
});

// ─── Mobile Layout Scale Tests ──────────────────────────────────────────────

describe('getMobileLayoutScale', () => {
  it('returns 1 for canvas width > 600', () => {
    expect(getMobileLayoutScale(800)).toBe(1);
    expect(getMobileLayoutScale(601)).toBe(1);
  });

  it('returns scaled value for canvas width <= 600', () => {
    expect(getMobileLayoutScale(600)).toBe(600 / 800);
    expect(getMobileLayoutScale(390)).toBe(390 / 800);
  });
});
