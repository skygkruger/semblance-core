import type { Meta, StoryObj } from '@storybook/react';
import { DetailPanel } from './detail-panel';
import type { KnowledgeNode, KnowledgeEdge } from './graph-types';

const sampleNodes: KnowledgeNode[] = [
  { id: 'n1', type: 'person', label: 'Jordan Chen', sublabel: 'jordan@acme.co', weight: 8 },
  { id: 'n2', type: 'email', label: 'Design review feedback', weight: 5 },
  { id: 'n3', type: 'calendar', label: 'Weekly standup', weight: 4 },
  { id: 'n4', type: 'file', label: 'Q4 Report.pdf', weight: 3 },
  { id: 'n5', type: 'topic', label: 'Product Design', weight: 6 },
  { id: 'n6', type: 'person', label: 'Alex Rivera', sublabel: 'alex@acme.co', weight: 4 },
  { id: 'cat1', type: 'category', label: 'Email', weight: 10, metadata: { category: 'email', color: '#8593A4', nodeCount: 234 } },
];

const sampleEdges: KnowledgeEdge[] = [
  { source: 'n1', target: 'n2', weight: 7 },
  { source: 'n1', target: 'n3', weight: 5 },
  { source: 'n1', target: 'n5', weight: 4 },
  { source: 'n2', target: 'n4', weight: 3 },
  { source: 'n3', target: 'n6', weight: 2 },
];

const meta: Meta<typeof DetailPanel> = {
  title: 'KnowledgeGraph/DetailPanel',
  component: DetailPanel,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', justifyContent: 'flex-end' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DetailPanel>;

export const PersonNode: Story = {
  args: {
    node: sampleNodes[0],
    edges: sampleEdges,
    allNodes: sampleNodes,
    onClose: () => {},
    onConnectionClick: () => {},
  },
};

export const EmailNode: Story = {
  args: {
    node: sampleNodes[1],
    edges: sampleEdges,
    allNodes: sampleNodes,
    onClose: () => {},
    onConnectionClick: () => {},
  },
};

export const TopicNode: Story = {
  args: {
    node: sampleNodes[4],
    edges: sampleEdges,
    allNodes: sampleNodes,
    onClose: () => {},
    onConnectionClick: () => {},
  },
};

export const CategoryNode: Story = {
  args: {
    node: sampleNodes[6],
    edges: sampleEdges,
    allNodes: sampleNodes,
    onClose: () => {},
    onConnectionClick: () => {},
    drillDown: {
      items: [
        { id: 'di1', label: 'Design review from Jordan', sublabel: 'Mar 1, 2026', category: 'email' },
        { id: 'di2', label: 'Weekly digest — Feb 24', sublabel: 'Feb 24, 2026', category: 'email' },
        { id: 'di3', label: 'Invoice from Figma', sublabel: 'Feb 20, 2026', category: 'email' },
      ],
      loading: false,
      hasMore: true,
      onLoadMore: () => {},
      onItemClick: () => {},
      onRecategorize: () => {},
    },
  },
};

export const NoNode: Story = {
  args: {
    node: null,
    edges: [],
    allNodes: [],
    onClose: () => {},
  },
};
