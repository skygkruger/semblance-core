// Storybook stories for RecategorizeSheet component.
// Bottom sheet with AI suggestions, category search, and create-new.

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { RecategorizeSheet } from './RecategorizeSheet.web';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { CategorySuggestion, CategoryInfo } from './RecategorizeSheet.types';

const DarkDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof RecategorizeSheet> = {
  title: 'Components/KnowledgeGraph/RecategorizeSheet',
  component: RecategorizeSheet,
  parameters: { layout: 'fullscreen' },
  decorators: [DarkDecorator],
};

export default meta;
type Story = StoryObj<typeof RecategorizeSheet>;

// ─── Sample data ───

const suggestions: CategorySuggestion[] = [
  { category: 'finance', confidence: 0.87, reason: 'Contains budget data and financial projections' },
  { category: 'work', confidence: 0.72, reason: 'Related to Portland project deliverables' },
  { category: 'reading', confidence: 0.34, reason: 'Document format suggests research material' },
];

const allCategories: CategoryInfo[] = [
  { category: 'work', count: 18, color: '#4A7FBA' },
  { category: 'knowledge', count: 15, color: '#8B93A7' },
  { category: 'health', count: 12, color: '#6E9474' },
  { category: 'people', count: 24, color: '#F5E6C8' },
  { category: 'social', count: 10, color: '#8B5CF6' },
  { category: 'finance', count: 8, color: '#B0A090' },
  { category: 'reading', count: 7, color: '#B07A8A' },
  { category: 'music', count: 4, color: '#EC4899' },
  { category: 'cloud', count: 6, color: '#8B93A7' },
  { category: 'browser', count: 9, color: '#6ECFA3' },
];

const noop = () => {};

// ─── Stories ───

export const WithSuggestions: Story = {
  render: () => (
    <RecategorizeSheet
      isOpen={true}
      currentCategory="work"
      suggestions={suggestions}
      allCategories={allCategories}
      loadingSuggestions={false}
      onClose={noop}
      onSelectCategory={noop}
      onCreateCategory={noop}
    />
  ),
};

export const LoadingSuggestions: Story = {
  render: () => (
    <RecategorizeSheet
      isOpen={true}
      currentCategory="knowledge"
      suggestions={[]}
      allCategories={allCategories}
      loadingSuggestions={true}
      onClose={noop}
      onSelectCategory={noop}
      onCreateCategory={noop}
    />
  ),
};

export const NoSuggestions: Story = {
  render: () => (
    <RecategorizeSheet
      isOpen={true}
      currentCategory="health"
      suggestions={[]}
      allCategories={allCategories}
      loadingSuggestions={false}
      onClose={noop}
      onSelectCategory={noop}
      onCreateCategory={noop}
    />
  ),
};
