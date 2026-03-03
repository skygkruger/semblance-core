import type { Meta, StoryObj } from '@storybook/react';
import { ForceGraph } from './ForceGraph';

const meta: Meta<typeof ForceGraph> = {
  title: 'Desktop/KnowledgeGraph/ForceGraph',
  component: ForceGraph,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ForceGraph>;

const now = new Date().toISOString();

export const SmallGraph: Story = {
  args: {
    nodes: [
      { id: 'n1', label: 'Sarah Chen', type: 'person', size: 8, createdAt: now, domain: 'email', metadata: {} },
      { id: 'n2', label: 'Q1 Budget Review', type: 'event', size: 5, createdAt: now, domain: 'calendar', metadata: {} },
      { id: 'n3', label: 'Budget_Final.xlsx', type: 'document', size: 3, createdAt: now, domain: 'documents', metadata: {} },
      { id: 'n4', label: 'Project Timeline', type: 'topic', size: 6, createdAt: now, domain: 'email', metadata: {} },
      { id: 'n5', label: 'Alex Rivera', type: 'person', size: 4, createdAt: now, domain: 'email', metadata: {} },
    ],
    edges: [
      { id: 'e1', sourceId: 'n1', targetId: 'n2', weight: 0.8, label: 'attendee' },
      { id: 'e2', sourceId: 'n1', targetId: 'n3', weight: 0.6, label: 'shared' },
      { id: 'e3', sourceId: 'n2', targetId: 'n4', weight: 0.7, label: 'related' },
      { id: 'e4', sourceId: 'n5', targetId: 'n2', weight: 0.5, label: 'attendee' },
      { id: 'e5', sourceId: 'n5', targetId: 'n4', weight: 0.4, label: 'mentioned' },
    ],
    clusters: [],
    width: 800,
    height: 600,
  },
};

export const CategoryView: Story = {
  args: {
    nodes: [
      { id: 'cat_communication', label: 'Communication', type: 'category', size: 45, createdAt: now, domain: 'general', metadata: { category: 'communication', color: '#4A7FBA', icon: 'mail', nodeCount: 45 } },
      { id: 'cat_scheduling', label: 'Scheduling', type: 'category', size: 28, createdAt: now, domain: 'general', metadata: { category: 'scheduling', color: '#3DB87A', icon: 'calendar', nodeCount: 28 } },
      { id: 'cat_documents', label: 'Documents', type: 'category', size: 32, createdAt: now, domain: 'general', metadata: { category: 'documents', color: '#8B93A7', icon: 'file', nodeCount: 32 } },
      { id: 'cat_finance', label: 'Finance', type: 'category', size: 15, createdAt: now, domain: 'general', metadata: { category: 'finance', color: '#E8A838', icon: 'dollar', nodeCount: 15 } },
    ],
    edges: [
      { id: 'ce1', sourceId: 'cat_communication', targetId: 'cat_scheduling', weight: 12, label: '12 connections' },
      { id: 'ce2', sourceId: 'cat_communication', targetId: 'cat_documents', weight: 8, label: '8 connections' },
      { id: 'ce3', sourceId: 'cat_scheduling', targetId: 'cat_documents', weight: 5, label: '5 connections' },
      { id: 'ce4', sourceId: 'cat_finance', targetId: 'cat_documents', weight: 7, label: '7 connections' },
    ],
    clusters: [],
    width: 800,
    height: 600,
  },
};

export const SingleNode: Story = {
  args: {
    nodes: [
      { id: 'n1', label: 'Semblance', type: 'topic', size: 10, createdAt: now, domain: 'general', metadata: {} },
    ],
    edges: [],
    clusters: [],
    width: 400,
    height: 300,
  },
};
