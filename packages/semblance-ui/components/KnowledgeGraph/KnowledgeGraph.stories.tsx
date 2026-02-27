import React, { useState, useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraph } from './KnowledgeGraph';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { KnowledgeNode, KnowledgeEdge } from './graph-types';

// ─── Local types for stories (avoids cross-package imports) ───

type VisualizationCategory =
  | 'health' | 'finance' | 'social' | 'work' | 'reading'
  | 'music' | 'cloud' | 'browser' | 'people' | 'knowledge';

interface StoryCategoryNode {
  id: string;
  category: VisualizationCategory;
  label: string;
  color: string;
  icon: string;
  nodeCount: number;
  totalSize: number;
  nodeIds: string[];
}

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#0B0E11',
    overflow: 'hidden',
  }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof KnowledgeGraph> = {
  title: 'Components/KnowledgeGraph',
  component: KnowledgeGraph,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof KnowledgeGraph>;

// ─── Realistic small graph ───

const smallNodes: KnowledgeNode[] = [
  { id: 'sarah', type: 'person', label: 'Sarah Chen', sublabel: '47 emails', weight: 18 },
  { id: 'marcus', type: 'person', label: 'Marcus Webb', sublabel: '31 emails', weight: 14 },
  { id: 'david', type: 'person', label: 'David Park', sublabel: '23 emails', weight: 11 },
  { id: 'contract', type: 'file', label: 'Portland Contract.pdf', sublabel: 'PDF \u2022 1.2MB', weight: 8 },
  { id: 'q3report', type: 'file', label: 'Q3 Report.xlsx', sublabel: 'Excel \u2022 847KB', weight: 6 },
  { id: 'meeting1', type: 'calendar', label: 'Strategy Review', sublabel: 'Tomorrow 2pm', weight: 7 },
  { id: 'meeting2', type: 'calendar', label: 'Portland Call', sublabel: 'Friday 10am', weight: 5 },
  { id: 'topic-portland', type: 'topic', label: 'Portland Project', weight: 3 },
  { id: 'topic-q3', type: 'topic', label: 'Q3 Planning', weight: 3 },
];

const smallEdges: KnowledgeEdge[] = [
  { source: 'sarah', target: 'contract', weight: 8 },
  { source: 'sarah', target: 'meeting1', weight: 6 },
  { source: 'sarah', target: 'topic-portland', weight: 5 },
  { source: 'marcus', target: 'q3report', weight: 7 },
  { source: 'marcus', target: 'meeting1', weight: 4 },
  { source: 'marcus', target: 'topic-q3', weight: 6 },
  { source: 'david', target: 'contract', weight: 5 },
  { source: 'david', target: 'topic-portland', weight: 4 },
  { source: 'david', target: 'meeting2', weight: 3 },
  { source: 'contract', target: 'topic-portland', weight: 3 },
  { source: 'meeting1', target: 'topic-q3', weight: 2 },
  { source: 'q3report', target: 'topic-q3', weight: 3 },
  { source: 'meeting2', target: 'topic-portland', weight: 2 },
];

export const SmallGraph: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={smallNodes}
      edges={smallEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Category graph — 6 categories, People expanded with 5 children ───

const categoryGraphNodes: KnowledgeNode[] = [
  // 6 category nodes
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#4A7FBA', nodeCount: 24, expanded: true } },
  { id: 'cat_work', type: 'category', label: 'Work & Productivity', sublabel: '18 entities', weight: 40, metadata: { category: 'work', color: '#4A7FBA', nodeCount: 18 } },
  { id: 'cat_knowledge', type: 'category', label: 'Documents & Notes', sublabel: '15 entities', weight: 35, metadata: { category: 'knowledge', color: '#8B93A7', nodeCount: 15 } },
  { id: 'cat_health', type: 'category', label: 'Health & Fitness', sublabel: '12 entities', weight: 30, metadata: { category: 'health', color: '#3DB87A', nodeCount: 12 } },
  { id: 'cat_social', type: 'category', label: 'Social & Messaging', sublabel: '10 entities', weight: 28, metadata: { category: 'social', color: '#8B5CF6', nodeCount: 10 } },
  { id: 'cat_reading', type: 'category', label: 'Reading & Research', sublabel: '7 entities', weight: 20, metadata: { category: 'reading', color: '#C97B6E', nodeCount: 7 } },
  // 5 expanded person nodes (People category expanded)
  { id: 'sarah-cg', type: 'person', label: 'Sarah Chen', sublabel: '47 emails', weight: 18 },
  { id: 'marcus-cg', type: 'person', label: 'Marcus Webb', sublabel: '31 emails', weight: 14 },
  { id: 'david-cg', type: 'person', label: 'David Park', sublabel: '23 emails', weight: 11 },
  { id: 'lisa-cg', type: 'person', label: 'Lisa Torres', sublabel: '19 emails', weight: 9 },
  { id: 'james-cg', type: 'person', label: 'James Kim', sublabel: '15 emails', weight: 7 },
];

const categoryGraphEdges: KnowledgeEdge[] = [
  // Category ↔ category cross-domain edges
  { source: 'cat_people', target: 'cat_work', weight: 8 },
  { source: 'cat_people', target: 'cat_social', weight: 7 },
  { source: 'cat_people', target: 'cat_knowledge', weight: 5 },
  { source: 'cat_work', target: 'cat_knowledge', weight: 6 },
  { source: 'cat_health', target: 'cat_people', weight: 3 },
  { source: 'cat_reading', target: 'cat_knowledge', weight: 5 },
  { source: 'cat_social', target: 'cat_reading', weight: 2 },
  // Person → category edges
  { source: 'sarah-cg', target: 'cat_work', weight: 6 },
  { source: 'marcus-cg', target: 'cat_work', weight: 4 },
  { source: 'sarah-cg', target: 'cat_knowledge', weight: 5 },
  { source: 'david-cg', target: 'cat_health', weight: 3 },
  { source: 'lisa-cg', target: 'cat_social', weight: 4 },
  { source: 'james-cg', target: 'cat_reading', weight: 2 },
  // Person ↔ person edges
  { source: 'sarah-cg', target: 'marcus-cg', weight: 5 },
  { source: 'sarah-cg', target: 'david-cg', weight: 3 },
  { source: 'marcus-cg', target: 'james-cg', weight: 2 },
  { source: 'david-cg', target: 'lisa-cg', weight: 4 },
  { source: 'lisa-cg', target: 'james-cg', weight: 1 },
];

export const CategoryGraph: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={categoryGraphNodes}
      edges={categoryGraphEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Mobile ───

export const Mobile: Story = {
  args: {
    nodes: smallNodes,
    edges: smallEdges,
    width: 390,
    height: 500,
  },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

// ─── Focused node ───

export const FocusedNode: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={smallNodes}
      edges={smallEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Category view — collapsed domain nodes ───

const categoryNodes: KnowledgeNode[] = [
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#4A7FBA', nodeCount: 24 } },
  { id: 'cat_work', type: 'category', label: 'Work & Productivity', sublabel: '18 entities', weight: 40, metadata: { category: 'work', color: '#4A7FBA', nodeCount: 18 } },
  { id: 'cat_knowledge', type: 'category', label: 'Documents & Notes', sublabel: '15 entities', weight: 35, metadata: { category: 'knowledge', color: '#8B93A7', nodeCount: 15 } },
  { id: 'cat_health', type: 'category', label: 'Health & Fitness', sublabel: '12 entities', weight: 30, metadata: { category: 'health', color: '#3DB87A', nodeCount: 12 } },
  { id: 'cat_finance', type: 'category', label: 'Finance', sublabel: '8 entities', weight: 25, metadata: { category: 'finance', color: '#C9A85C', nodeCount: 8 } },
  { id: 'cat_social', type: 'category', label: 'Social & Messaging', sublabel: '10 entities', weight: 28, metadata: { category: 'social', color: '#8B5CF6', nodeCount: 10 } },
  { id: 'cat_reading', type: 'category', label: 'Reading & Research', sublabel: '7 entities', weight: 20, metadata: { category: 'reading', color: '#C97B6E', nodeCount: 7 } },
  { id: 'cat_music', type: 'category', label: 'Music & Entertainment', sublabel: '4 entities', weight: 15, metadata: { category: 'music', color: '#EC4899', nodeCount: 4 } },
  { id: 'cat_cloud', type: 'category', label: 'Cloud Storage', sublabel: '6 entities', weight: 18, metadata: { category: 'cloud', color: '#8B93A7', nodeCount: 6 } },
  { id: 'cat_browser', type: 'category', label: 'Browsing', sublabel: '9 entities', weight: 22, metadata: { category: 'browser', color: '#6ECFA3', nodeCount: 9 } },
];

const categoryEdges: KnowledgeEdge[] = [
  { source: 'cat_people', target: 'cat_work', weight: 8 },
  { source: 'cat_people', target: 'cat_social', weight: 7 },
  { source: 'cat_people', target: 'cat_knowledge', weight: 5 },
  { source: 'cat_work', target: 'cat_knowledge', weight: 6 },
  { source: 'cat_work', target: 'cat_cloud', weight: 4 },
  { source: 'cat_health', target: 'cat_people', weight: 3 },
  { source: 'cat_finance', target: 'cat_work', weight: 4 },
  { source: 'cat_reading', target: 'cat_knowledge', weight: 5 },
  { source: 'cat_social', target: 'cat_music', weight: 2 },
  { source: 'cat_browser', target: 'cat_reading', weight: 3 },
  { source: 'cat_browser', target: 'cat_work', weight: 3 },
  { source: 'cat_cloud', target: 'cat_knowledge', weight: 4 },
];

export const CategoryView: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={categoryNodes}
      edges={categoryEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Mixed — expanded "People" category + collapsed others ───

export const MixedCategoryEntity: Story = {
  render: () => {
    const nodes: KnowledgeNode[] = [
      // Collapsed categories (all except People)
      ...categoryNodes.filter(n => n.id !== 'cat_people'),
      // Expanded People → individual person nodes
      { id: 'sarah', type: 'person', label: 'Sarah Chen', sublabel: '47 emails', weight: 18 },
      { id: 'marcus', type: 'person', label: 'Marcus Webb', sublabel: '31 emails', weight: 14 },
      { id: 'david', type: 'person', label: 'David Park', sublabel: '23 emails', weight: 11 },
      { id: 'lisa', type: 'person', label: 'Lisa Torres', sublabel: '19 emails', weight: 9 },
      { id: 'james', type: 'person', label: 'James Kim', sublabel: '15 emails', weight: 7 },
    ];
    const edges: KnowledgeEdge[] = [
      // Person → category cross-domain edges
      { source: 'sarah', target: 'cat_work', weight: 6 },
      { source: 'marcus', target: 'cat_work', weight: 4 },
      { source: 'sarah', target: 'cat_knowledge', weight: 5 },
      { source: 'david', target: 'cat_finance', weight: 3 },
      { source: 'lisa', target: 'cat_social', weight: 4 },
      { source: 'james', target: 'cat_health', weight: 2 },
      // Person ↔ person
      { source: 'sarah', target: 'marcus', weight: 5 },
      { source: 'sarah', target: 'david', weight: 3 },
      { source: 'marcus', target: 'james', weight: 2 },
      // Category ↔ category
      { source: 'cat_work', target: 'cat_knowledge', weight: 6 },
      { source: 'cat_health', target: 'cat_work', weight: 2 },
      { source: 'cat_reading', target: 'cat_knowledge', weight: 4 },
      { source: 'cat_cloud', target: 'cat_knowledge', weight: 3 },
      { source: 'cat_browser', target: 'cat_reading', weight: 3 },
      { source: 'cat_social', target: 'cat_music', weight: 2 },
    ];
    return (
      <KnowledgeGraph
        nodes={nodes}
        edges={edges}
        width={window.innerWidth}
        height={window.innerHeight}
      />
    );
  },
};

// ─── Locked categories — 4 locked + 2 unlocked ───

const lockedCategoryNodes: KnowledgeNode[] = [
  // Locked (nodeCount: 0)
  { id: 'cat_music', type: 'category', label: 'Music & Entertainment', sublabel: '0 entities', weight: 10, metadata: { category: 'music', color: '#EC4899', nodeCount: 0 } },
  { id: 'cat_cloud', type: 'category', label: 'Cloud Storage', sublabel: '0 entities', weight: 10, metadata: { category: 'cloud', color: '#8B93A7', nodeCount: 0 } },
  { id: 'cat_browser', type: 'category', label: 'Browsing', sublabel: '0 entities', weight: 10, metadata: { category: 'browser', color: '#6ECFA3', nodeCount: 0 } },
  { id: 'cat_finance', type: 'category', label: 'Finance', sublabel: '0 entities', weight: 10, metadata: { category: 'finance', color: '#C9A85C', nodeCount: 0 } },
  // Unlocked (with data)
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#4A7FBA', nodeCount: 24 } },
  { id: 'cat_work', type: 'category', label: 'Work & Productivity', sublabel: '18 entities', weight: 40, metadata: { category: 'work', color: '#4A7FBA', nodeCount: 18 } },
];

const lockedCategoryEdges: KnowledgeEdge[] = [
  { source: 'cat_people', target: 'cat_work', weight: 6 },
];

export const LockedCategories: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={lockedCategoryNodes}
      edges={lockedCategoryEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── FilterPanel view — real FilterPanel alongside graph ───

const filterPanelCategories: StoryCategoryNode[] = [
  { id: 'cat_people', category: 'people', label: 'People', color: '#4A7FBA', icon: '[P]', nodeCount: 24, totalSize: 120, nodeIds: [] },
  { id: 'cat_work', category: 'work', label: 'Work & Productivity', color: '#4A7FBA', icon: '[>]', nodeCount: 18, totalSize: 90, nodeIds: [] },
  { id: 'cat_knowledge', category: 'knowledge', label: 'Documents & Notes', color: '#8B93A7', icon: '[D]', nodeCount: 15, totalSize: 75, nodeIds: [] },
  { id: 'cat_health', category: 'health', label: 'Health & Fitness', color: '#3DB87A', icon: '[+]', nodeCount: 12, totalSize: 60, nodeIds: [] },
];

const filterPanelNodes: KnowledgeNode[] = [
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#4A7FBA', nodeCount: 24 } },
  { id: 'cat_work', type: 'category', label: 'Work & Productivity', sublabel: '18 entities', weight: 40, metadata: { category: 'work', color: '#4A7FBA', nodeCount: 18 } },
  { id: 'cat_knowledge', type: 'category', label: 'Documents & Notes', sublabel: '15 entities', weight: 35, metadata: { category: 'knowledge', color: '#8B93A7', nodeCount: 15 } },
  { id: 'cat_health', type: 'category', label: 'Health & Fitness', sublabel: '12 entities', weight: 30, metadata: { category: 'health', color: '#3DB87A', nodeCount: 12 } },
];

const filterPanelEdges: KnowledgeEdge[] = [
  { source: 'cat_people', target: 'cat_work', weight: 6 },
  { source: 'cat_work', target: 'cat_knowledge', weight: 4 },
  { source: 'cat_health', target: 'cat_people', weight: 3 },
];

const allCats: VisualizationCategory[] = [
  'health', 'finance', 'social', 'work', 'reading',
  'music', 'cloud', 'browser', 'people', 'knowledge',
];

// Inline FilterPanel — mirrors packages/desktop/src/components/FilterPanel.tsx
// to avoid cross-package imports that break Storybook's Vite bundler.
const FP_TOKEN = {
  base: '#0B0E11',
  b2: 'rgba(255, 255, 255, 0.09)',
  sv3: '#A8B4C0',
  white: '#EEF1F4',
  v: '#6ECFA3',
  s2: '#171B1F',
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'DM Mono', monospace",
} as const;

const InlineFilterPanel: React.FC<{
  categories: StoryCategoryNode[];
  enabledCategories: Set<VisualizationCategory>;
  onToggleCategory: (category: VisualizationCategory) => void;
  onResetFilters: () => void;
}> = ({ categories, enabledCategories, onToggleCategory, onResetFilters }) => (
  <div
    data-testid="filter-panel"
    style={{
      width: 240,
      background: FP_TOKEN.base,
      borderRight: `1px solid ${FP_TOKEN.b2}`,
      padding: 16,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}
  >
    <div style={{ fontFamily: FP_TOKEN.fontBody, fontSize: 13, fontWeight: 600, color: FP_TOKEN.white, marginBottom: 12 }}>
      Filter Categories
    </div>
    {categories.map(cat => {
      const on = enabledCategories.has(cat.category);
      return (
        <div
          key={cat.id}
          data-testid={`filter-row-${cat.category}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 4, opacity: on ? 1 : 0.4, cursor: 'pointer' }}
          onClick={() => onToggleCategory(cat.category)}
        >
          <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cat.color, flexShrink: 0 }} />
          <div style={{ flex: 1, fontFamily: FP_TOKEN.fontBody, fontSize: 13, color: FP_TOKEN.sv3 }}>{cat.label}</div>
          <div style={{ fontFamily: FP_TOKEN.fontMono, fontSize: 11, color: FP_TOKEN.sv3, marginRight: 8 }}>{cat.nodeCount}</div>
          <div
            data-testid={`filter-toggle-${cat.category}`}
            style={{ width: 28, height: 16, borderRadius: 8, backgroundColor: on ? FP_TOKEN.v : FP_TOKEN.s2, position: 'relative', transition: 'background-color 0.2s', flexShrink: 0 }}
          >
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: FP_TOKEN.white, position: 'absolute', top: 2, left: on ? 14 : 2, transition: 'left 0.2s' }} />
          </div>
        </div>
      );
    })}
    <button
      data-testid="filter-reset"
      onClick={onResetFilters}
      style={{ marginTop: 12, padding: '6px 12px', background: 'transparent', border: `1px solid ${FP_TOKEN.b2}`, borderRadius: 4, color: FP_TOKEN.sv3, fontFamily: FP_TOKEN.fontBody, fontSize: 12, cursor: 'pointer' }}
    >
      Reset Filters
    </button>
  </div>
);

export const FilterPanelView: Story = {
  render: () => {
    const [enabled, setEnabled] = useState<Set<VisualizationCategory>>(new Set(allCats));
    const toggle = (cat: VisualizationCategory) => {
      setEnabled(prev => {
        const next = new Set(prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        return next;
      });
    };
    const reset = () => setEnabled(new Set(allCats));

    // Derive filtered graph data reactively from enabledCategories
    const filteredNodes = useMemo(() =>
      filterPanelNodes.filter(n =>
        n.type !== 'category' || enabled.has(n.metadata?.category as VisualizationCategory),
      ),
      [enabled],
    );

    const filteredEdges = useMemo(() => {
      const nodeIds = new Set(filteredNodes.map(n => n.id));
      return filterPanelEdges.filter(e => {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return nodeIds.has(srcId) && nodeIds.has(tgtId);
      });
    }, [filteredNodes]);

    return (
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        <InlineFilterPanel
          categories={filterPanelCategories}
          enabledCategories={enabled}
          onToggleCategory={toggle}
          onResetFilters={reset}
        />
        <div style={{ flex: 1 }}>
          <KnowledgeGraph
            nodes={filteredNodes}
            edges={filteredEdges}
            width={window.innerWidth - 240}
            height={window.innerHeight}
          />
        </div>
      </div>
    );
  },
};

// ─── Stats overlay view — Three.js graph with mock stats overlay ───

const STATS_TOKEN = {
  base: '#0B0E11',
  b2: 'rgba(255, 255, 255, 0.09)',
  white: '#EEF1F4',
  sv3: '#A8B4C0',
  v: '#6ECFA3',
  fontBody: "'DM Sans', system-ui, sans-serif",
  fontMono: "'DM Mono', monospace",
} as const;

export const StatsOverlayView: Story = {
  render: () => (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <KnowledgeGraph
        nodes={categoryNodes}
        edges={categoryEdges}
        width={window.innerWidth}
        height={window.innerHeight}
      />
      {/* Stats overlay positioned top-right */}
      <div
        data-testid="stats-overlay"
        style={{
          position: 'absolute',
          top: 24,
          right: 24,
          width: 280,
          padding: 20,
          background: STATS_TOKEN.base,
          border: `1px solid ${STATS_TOKEN.b2}`,
          borderRadius: 4,
          zIndex: 10,
        }}
      >
        <div style={{
          fontFamily: STATS_TOKEN.fontBody,
          fontSize: 15,
          fontWeight: 600,
          color: STATS_TOKEN.white,
          marginBottom: 16,
        }}>
          Your Knowledge Graph
        </div>
        <div style={{
          fontFamily: STATS_TOKEN.fontMono,
          fontSize: 12,
          color: STATS_TOKEN.sv3,
          marginBottom: 12,
        }}>
          2,847 entities | 14,203 connections
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontFamily: STATS_TOKEN.fontBody,
            fontSize: 12,
            color: STATS_TOKEN.sv3,
            marginBottom: 4,
          }}>
            Active sources: 12 of 45
          </div>
          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: 4,
            background: STATS_TOKEN.b2,
            borderRadius: 2,
          }}>
            <div style={{
              width: `${(12 / 45) * 100}%`,
              height: '100%',
              background: STATS_TOKEN.v,
              borderRadius: 2,
            }} />
          </div>
        </div>
        <div style={{
          fontFamily: STATS_TOKEN.fontBody,
          fontSize: 12,
          color: STATS_TOKEN.sv3,
          marginBottom: 8,
        }}>
          Cross-domain insights: <span style={{ fontFamily: STATS_TOKEN.fontMono, color: STATS_TOKEN.v }}>847</span>
        </div>
        <div style={{
          fontFamily: STATS_TOKEN.fontBody,
          fontSize: 12,
          color: STATS_TOKEN.sv3,
          marginBottom: 8,
        }}>
          Most connected: <span style={{ fontFamily: STATS_TOKEN.fontMono, color: STATS_TOKEN.white }}>Sarah Chen</span>
        </div>
        <div style={{
          fontFamily: STATS_TOKEN.fontBody,
          fontSize: 12,
          color: STATS_TOKEN.sv3,
        }}>
          Fastest growing: <span style={{ fontFamily: STATS_TOKEN.fontMono, color: STATS_TOKEN.white }}>Health</span>
        </div>
      </div>
    </div>
  ),
};
