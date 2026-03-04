import type { Meta, StoryObj } from '@storybook/react';
import { CategoryLegend } from './CategoryLegend';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof CategoryLegend> = {
  title: 'KnowledgeGraph/CategoryLegend',
  component: CategoryLegend,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CategoryLegend>;

const sampleCategories = [
  { id: 'cat-email', label: 'Email', color: '#8593A4', nodeCount: 234, category: 'email' },
  { id: 'cat-calendar', label: 'Calendar', color: '#C9A85C', nodeCount: 89, category: 'calendar' },
  { id: 'cat-files', label: 'Files', color: '#C8CAD0', nodeCount: 156, category: 'files' },
  { id: 'cat-people', label: 'People', color: '#F5E6C8', nodeCount: 47, category: 'people' },
  { id: 'cat-health', label: 'Health', color: '#6ECFA3', nodeCount: 32, category: 'health' },
  { id: 'cat-finance', label: 'Finance', color: '#C97B6E', nodeCount: 0, category: 'finance' },
];

export const Desktop: Story = {
  args: {
    categories: sampleCategories,
    onCategoryClick: () => {},
  },
};

export const Compact: Story = {
  args: {
    categories: sampleCategories,
    compact: true,
    onCategoryClick: () => {},
  },
};

export const FewCategories: Story = {
  args: {
    categories: sampleCategories.slice(0, 3),
    onCategoryClick: () => {},
  },
};

export const WithOffset: Story = {
  args: {
    categories: sampleCategories,
    leftOffset: 200,
    onCategoryClick: () => {},
  },
};

export const AllLocked: Story = {
  args: {
    categories: sampleCategories.map(c => ({ ...c, nodeCount: 0 })),
    onCategoryClick: () => {},
  },
};
