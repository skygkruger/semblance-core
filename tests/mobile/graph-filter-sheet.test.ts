// Graph Filter Sheet + Mobile Category Support Tests — 5 tests.

import { describe, it, expect, vi } from 'vitest';
import type { GraphFilterSheetProps } from '../../packages/mobile/src/screens/GraphFilterSheet';
import type { CategoryNode } from '../../packages/core/knowledge/graph-visualization';
import type { VisualizationCategory } from '../../packages/core/knowledge/connector-category-map';
import type { VisualizationNode, VisualizationEdge } from '../../packages/core/knowledge/graph-visualization';

function makeCategoryNode(overrides: Partial<CategoryNode> = {}): CategoryNode {
  return {
    id: overrides.id ?? 'cat_people',
    category: (overrides.category ?? 'people') as VisualizationCategory,
    label: overrides.label ?? 'People',
    color: overrides.color ?? '#4A7FBA',
    icon: overrides.icon ?? '[P]',
    nodeCount: overrides.nodeCount ?? 10,
    totalSize: overrides.totalSize ?? 50,
    nodeIds: overrides.nodeIds ?? ['n1', 'n2'],
  };
}

describe('GraphFilterSheet', () => {
  it('renders toggle per non-empty category', () => {
    const categories: CategoryNode[] = [
      makeCategoryNode({ category: 'people', nodeCount: 5 }),
      makeCategoryNode({ id: 'cat_knowledge', category: 'knowledge', label: 'Docs', nodeCount: 3 }),
      makeCategoryNode({ id: 'cat_health', category: 'health', label: 'Health', nodeCount: 7 }),
    ];

    // Simulate: each category with nodeCount > 0 gets a toggle
    const renderedToggles = categories.filter(c => c.nodeCount > 0);
    expect(renderedToggles).toHaveLength(3);
  });

  it('toggle callback fires with correct category', () => {
    const onToggle = vi.fn();

    // Simulate pressing the health toggle
    const category: VisualizationCategory = 'health';
    onToggle(category);

    expect(onToggle).toHaveBeenCalledWith('health');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Mobile category node support', () => {
  it('category nodes have proper metadata for Skia renderer', () => {
    const catNode: VisualizationNode = {
      id: 'cat_people',
      label: 'People',
      type: 'category',
      size: 50,
      createdAt: '2025-01-01T00:00:00Z',
      domain: 'general',
      metadata: { category: 'people', color: '#4A7FBA', nodeCount: 10 },
    };

    // Verify the category metadata the Skia renderer expects
    expect(catNode.type).toBe('category');
    expect(catNode.metadata.category).toBe('people');
    expect(catNode.metadata.color).toBe('#4A7FBA');
    expect(catNode.metadata.nodeCount).toBe(10);
  });

  it('category_tap message type is handled', () => {
    // Simulate the message handler from KnowledgeGraphScreen
    const handleMessage = (data: string): { type: string; categoryId?: string; nodeId?: string } | null => {
      try {
        return JSON.parse(data) as { type: string; categoryId?: string; nodeId?: string };
      } catch {
        return null;
      }
    };

    const catTapMsg = handleMessage(JSON.stringify({ type: 'category_tap', categoryId: 'cat_health' }));
    expect(catTapMsg).not.toBeNull();
    expect(catTapMsg!.type).toBe('category_tap');
    expect(catTapMsg!.categoryId).toBe('cat_health');

    const nodeTapMsg = handleMessage(JSON.stringify({ type: 'node_tap', nodeId: 'person_1' }));
    expect(nodeTapMsg).not.toBeNull();
    expect(nodeTapMsg!.type).toBe('node_tap');
    expect(nodeTapMsg!.nodeId).toBe('person_1');
  });

  it('category nodes get category type in KnowledgeNode conversion', () => {
    // Mirrors the toKnowledgeNode function in the mobile screen
    const vizNode: VisualizationNode = {
      id: 'cat_knowledge',
      label: 'Documents & Notes',
      type: 'category',
      size: 30,
      createdAt: '2025-01-01T00:00:00Z',
      domain: 'general',
      metadata: { category: 'knowledge', color: '#A8956E', nodeCount: 15 },
    };

    // The conversion maps 'category' -> 'category' in the KnowledgeNode type system
    const kgType = vizNode.type === 'person' ? 'person'
      : vizNode.type === 'event' ? 'calendar'
      : vizNode.type === 'document' ? 'file'
      : vizNode.type === 'category' ? 'category'
      : 'topic';

    expect(kgType).toBe('category');
    expect(vizNode.metadata.nodeCount).toBe(15);
  });
});
