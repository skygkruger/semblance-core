import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraph, DotMatrix } from '@semblance/ui';
import type { KnowledgeNode, KnowledgeEdge, DrillDownConfig, DrillDownItem } from '@semblance/ui';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 0 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof KnowledgeGraph> = {
  title: 'Desktop/KnowledgeGraph',
  component: KnowledgeGraph,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof KnowledgeGraph>;

// ─── Small entity graph ───

const smallNodes: KnowledgeNode[] = [
  { id: 'sarah', type: 'person', label: 'Sarah Chen', sublabel: '47 emails', weight: 18, metadata: { activityScore: 0.9 } },
  { id: 'marcus', type: 'person', label: 'Marcus Webb', sublabel: '31 emails', weight: 14, metadata: { activityScore: 0.65 } },
  { id: 'david', type: 'person', label: 'David Park', sublabel: '23 emails', weight: 11, metadata: { activityScore: 0.4 } },
  { id: 'contract', type: 'file', label: 'Portland Contract.pdf', sublabel: 'PDF \u2022 1.2MB', weight: 8, metadata: { activityScore: 0.8 } },
  { id: 'q3report', type: 'file', label: 'Q3 Report.xlsx', sublabel: 'Excel \u2022 847KB', weight: 6, metadata: { activityScore: 0.2 } },
  { id: 'meeting1', type: 'calendar', label: 'Strategy Review', sublabel: 'Tomorrow 2pm', weight: 7, metadata: { activityScore: 0.55 } },
  { id: 'meeting2', type: 'calendar', label: 'Portland Call', sublabel: 'Friday 10am', weight: 5, metadata: { activityScore: 0.35 } },
  { id: 'topic-portland', type: 'topic', label: 'Portland Project', weight: 3, metadata: { activityScore: 0.15 } },
  { id: 'topic-q3', type: 'topic', label: 'Q3 Planning', weight: 3, metadata: { activityScore: 0.1 } },
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

export const Default: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={smallNodes}
      edges={smallEdges}
      width={window.innerWidth}
      height={window.innerHeight}
    />
  ),
};

// ─── Category graph ───

const categoryNodes: KnowledgeNode[] = [
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#F5E6C8', nodeCount: 24 } },
  { id: 'cat_work', type: 'category', label: 'Work & Productivity', sublabel: '18 entities', weight: 40, metadata: { category: 'work', color: '#4A7FBA', nodeCount: 18 } },
  { id: 'cat_knowledge', type: 'category', label: 'Documents & Notes', sublabel: '15 entities', weight: 35, metadata: { category: 'knowledge', color: '#8B93A7', nodeCount: 15 } },
  { id: 'cat_health', type: 'category', label: 'Health & Fitness', sublabel: '12 entities', weight: 30, metadata: { category: 'health', color: '#3DB87A', nodeCount: 12 } },
  { id: 'cat_finance', type: 'category', label: 'Finance', sublabel: '8 entities', weight: 25, metadata: { category: 'finance', color: '#C9A85C', nodeCount: 8 } },
  { id: 'cat_social', type: 'category', label: 'Social & Messaging', sublabel: '10 entities', weight: 28, metadata: { category: 'social', color: '#8B5CF6', nodeCount: 10 } },
];

const categoryEdges: KnowledgeEdge[] = [
  { source: 'cat_people', target: 'cat_work', weight: 8 },
  { source: 'cat_people', target: 'cat_social', weight: 7 },
  { source: 'cat_people', target: 'cat_knowledge', weight: 5 },
  { source: 'cat_work', target: 'cat_knowledge', weight: 6 },
  { source: 'cat_health', target: 'cat_people', weight: 3 },
  { source: 'cat_finance', target: 'cat_work', weight: 4 },
];

// ─── Sample drill-down items for category stories ───

const sampleDrillDownItems: DrillDownItem[] = [
  { chunkId: 'c1', title: 'Q3 Strategy Review Notes', preview: 'Meeting notes from the quarterly strategy review covering Portland expansion...', source: 'local_file', category: 'work', indexedAt: '2026-02-28T14:30:00Z', mimeType: 'text/markdown' },
  { chunkId: 'c2', title: 'Portland Contract v3.pdf', preview: 'Third revision of the Portland office lease agreement with amended terms...', source: 'local_file', category: 'work', indexedAt: '2026-02-27T09:15:00Z', mimeType: 'application/pdf' },
  { chunkId: 'c3', title: 'Budget Forecast 2026', preview: 'Annual budget projections including headcount growth and infrastructure costs...', source: 'local_file', category: 'finance', indexedAt: '2026-02-25T11:00:00Z', mimeType: 'application/vnd.ms-excel' },
  { chunkId: 'c4', title: 'Team Standup — Feb 24', preview: 'Daily standup notes: Sarah on Portland timeline, Marcus on Q3 deliverables...', source: 'calendar', category: 'work', indexedAt: '2026-02-24T10:00:00Z' },
  { chunkId: 'c5', title: 'Health Insurance Renewal', preview: 'Annual renewal documents for company health insurance plan comparison...', source: 'email', category: 'health', indexedAt: '2026-02-22T16:45:00Z' },
  { chunkId: 'c6', title: 'Gym Membership Receipt', preview: 'Monthly payment confirmation for Equinox membership — auto-renewed...', source: 'financial', category: 'health', indexedAt: '2026-02-20T08:00:00Z' },
];

const sampleDrillDown: DrillDownConfig = {
  items: sampleDrillDownItems,
  total: 18,
  loading: false,
  hasMore: true,
  onSearch: (query: string) => console.log('[DrillDown] search:', query),
  onLoadMore: () => console.log('[DrillDown] load more'),
  onItemClick: (item: DrillDownItem) => console.log('[DrillDown] item click:', item.title),
};

export const CategoryView: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={categoryNodes}
      edges={categoryEdges}
      width={window.innerWidth}
      height={window.innerHeight}
      layoutMode="radial"
      drillDown={sampleDrillDown}
    />
  ),
};

export const WithStats: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={categoryNodes}
      edges={categoryEdges}
      width={window.innerWidth}
      height={window.innerHeight}
      layoutMode="radial"
      stats={{ entities: 2847, insights: 847 }}
      drillDown={sampleDrillDown}
    />
  ),
};

export const SmallGraph: Story = {
  args: {
    nodes: smallNodes.slice(0, 3),
    edges: smallEdges.slice(0, 2),
    width: 600,
    height: 400,
  },
};
