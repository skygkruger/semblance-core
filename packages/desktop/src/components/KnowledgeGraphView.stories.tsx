import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraph, DotMatrix } from '@semblance/ui';
import type { KnowledgeNode, KnowledgeEdge } from '@semblance/ui';

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
  { id: 'cat_people', type: 'category', label: 'People', sublabel: '24 entities', weight: 50, metadata: { category: 'people', color: '#4A7FBA', nodeCount: 24 } },
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

export const CategoryView: Story = {
  render: () => (
    <KnowledgeGraph
      nodes={categoryNodes}
      edges={categoryEdges}
      width={window.innerWidth}
      height={window.innerHeight}
      layoutMode="radial"
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
