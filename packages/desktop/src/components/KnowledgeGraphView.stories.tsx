import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeGraphView } from './KnowledgeGraphView';

const meta: Meta<typeof KnowledgeGraphView> = {
  title: 'Desktop/KnowledgeGraph/KnowledgeGraphView',
  component: KnowledgeGraphView,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof KnowledgeGraphView>;

const now = new Date().toISOString();
const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();

const baseGraph = {
  nodes: [
    { id: 'n1', label: 'Sarah Chen', type: 'person' as const, size: 8, createdAt: weekAgo, domain: 'email', metadata: {} },
    { id: 'n2', label: 'Q1 Budget Review', type: 'event' as const, size: 5, createdAt: weekAgo, domain: 'calendar', metadata: {} },
    { id: 'n3', label: 'Budget_Final.xlsx', type: 'document' as const, size: 3, createdAt: now, domain: 'documents', metadata: {} },
    { id: 'n4', label: 'Project Timeline', type: 'topic' as const, size: 6, createdAt: now, domain: 'email', metadata: {} },
    { id: 'n5', label: 'Alex Rivera', type: 'person' as const, size: 4, createdAt: weekAgo, domain: 'email', metadata: {} },
    { id: 'n6', label: 'Sprint Planning', type: 'event' as const, size: 4, createdAt: now, domain: 'calendar', metadata: {} },
    { id: 'n7', label: 'Quarterly Report', type: 'document' as const, size: 5, createdAt: now, domain: 'documents', metadata: {} },
  ],
  edges: [
    { id: 'e1', sourceId: 'n1', targetId: 'n2', weight: 0.8, label: 'attendee' },
    { id: 'e2', sourceId: 'n1', targetId: 'n3', weight: 0.6, label: 'shared' },
    { id: 'e3', sourceId: 'n2', targetId: 'n4', weight: 0.7, label: 'related' },
    { id: 'e4', sourceId: 'n5', targetId: 'n2', weight: 0.5, label: 'attendee' },
    { id: 'e5', sourceId: 'n5', targetId: 'n6', weight: 0.6, label: 'organizer' },
    { id: 'e6', sourceId: 'n3', targetId: 'n7', weight: 0.4, label: 'referenced_in' },
  ],
  clusters: [],
  stats: {
    totalNodes: 7,
    totalEdges: 6,
    activeSources: 3,
    totalSources: 5,
    mostConnectedNode: { id: 'n1', label: 'Sarah Chen' },
    fastestGrowingCategory: 'Documents',
    crossDomainInsights: 4,
  },
};

export const Default: Story = {
  args: {
    graph: baseGraph,
    width: 1000,
    height: 700,
  },
};

export const WithExport: Story = {
  args: {
    graph: baseGraph,
    onExport: () => {},
    width: 1000,
    height: 700,
  },
};

export const SmallGraph: Story = {
  args: {
    graph: {
      nodes: [
        { id: 'n1', label: 'Semblance', type: 'topic' as const, size: 10, createdAt: now, domain: 'general', metadata: {} },
        { id: 'n2', label: 'Privacy', type: 'topic' as const, size: 7, createdAt: now, domain: 'general', metadata: {} },
      ],
      edges: [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', weight: 0.9, label: 'core_value' },
      ],
      clusters: [],
      stats: {
        totalNodes: 2,
        totalEdges: 1,
        activeSources: 1,
        totalSources: 1,
        mostConnectedNode: null,
        fastestGrowingCategory: null,
        crossDomainInsights: 0,
      },
    },
    width: 600,
    height: 400,
  },
};
