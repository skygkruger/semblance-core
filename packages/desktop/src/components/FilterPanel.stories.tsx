import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { FilterPanel } from './FilterPanel';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof FilterPanel> = {
  title: 'Desktop/KnowledgeGraph/FilterPanel',
  component: FilterPanel,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof FilterPanel>;

const allCategories = [
  { id: 'cat_communication', category: 'communication' as const, label: 'Communication', color: '#4A7FBA', icon: 'mail', nodeCount: 45, totalSize: 120, nodeIds: [] },
  { id: 'cat_scheduling', category: 'scheduling' as const, label: 'Scheduling', color: '#3DB87A', icon: 'calendar', nodeCount: 28, totalSize: 80, nodeIds: [] },
  { id: 'cat_documents', category: 'documents' as const, label: 'Documents', color: '#8B93A7', icon: 'file', nodeCount: 32, totalSize: 95, nodeIds: [] },
  { id: 'cat_finance', category: 'finance' as const, label: 'Finance', color: '#E8A838', icon: 'dollar', nodeCount: 15, totalSize: 40, nodeIds: [] },
  { id: 'cat_health', category: 'health' as const, label: 'Health', color: '#E85D5D', icon: 'heart', nodeCount: 8, totalSize: 20, nodeIds: [] },
  { id: 'cat_location', category: 'location' as const, label: 'Location', color: '#5BA3A3', icon: 'map-pin', nodeCount: 12, totalSize: 30, nodeIds: [] },
];

export const AllEnabled: Story = {
  args: {
    categories: allCategories,
    enabledCategories: new Set(['communication', 'scheduling', 'documents', 'finance', 'health', 'location']),
    onToggleCategory: () => {},
    onResetFilters: () => {},
  },
};

export const SomeDisabled: Story = {
  args: {
    categories: allCategories,
    enabledCategories: new Set(['communication', 'documents']),
    onToggleCategory: () => {},
    onResetFilters: () => {},
  },
};
