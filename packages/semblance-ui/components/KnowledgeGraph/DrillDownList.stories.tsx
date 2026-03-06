// Storybook stories for DrillDownList component.
// Shows knowledge items within a category with search, pagination, loading states.

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DrillDownList } from './DrillDownList';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { DrillDownItem } from './DrillDownList.types';

const DarkDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1, width: 360, padding: 16, minHeight: '100vh' }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof DrillDownList> = {
  title: 'Components/KnowledgeGraph/DrillDownList',
  component: DrillDownList,
  decorators: [DarkDecorator],
};

export default meta;
type Story = StoryObj<typeof DrillDownList>;

// ─── Sample items ───

const sampleItems: DrillDownItem[] = [
  {
    chunkId: 'c1',
    title: 'Portland Contract Draft v3.pdf',
    preview: 'Service agreement between Acme Corp and Portland Regional Office for fiscal year 2026...',
    source: 'local_file',
    category: 'work',
    indexedAt: '2026-02-28T14:30:00Z',
    mimeType: 'application/pdf',
  },
  {
    chunkId: 'c2',
    title: 'Re: Q3 Budget Review',
    preview: 'Hey Sarah, attached the updated numbers. Let me know if the variance on line 42 looks...',
    source: 'email',
    category: 'work',
    indexedAt: '2026-02-27T09:15:00Z',
    mimeType: 'message/rfc822',
  },
  {
    chunkId: 'c3',
    title: 'Meeting Notes - Strategy Sync',
    preview: 'Action items: 1) Finalize Portland timeline 2) Send updated proposal 3) Schedule follow-up...',
    source: 'note',
    category: 'work',
    indexedAt: '2026-02-26T16:00:00Z',
  },
  {
    chunkId: 'c4',
    title: 'Quarterly Forecast.xlsx',
    preview: 'Revenue projections show 12% growth in Q3 with conservative estimates for new client...',
    source: 'local_file',
    category: 'work',
    indexedAt: '2026-02-25T11:45:00Z',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    chunkId: 'c5',
    title: 'Team Standup Summary',
    preview: 'Blockers: API integration delayed by auth changes. Marcus to follow up with DevOps...',
    source: 'conversation',
    category: 'work',
    indexedAt: '2026-02-24T10:00:00Z',
  },
];

const noop = () => {};

// ─── Stories ───

export const WithItems: Story = {
  render: () => (
    <DrillDownList
      category="work"
      categoryLabel="Work & Productivity"
      categoryColor="#4A7FBA"
      items={sampleItems}
      total={18}
      loading={false}
      onSearch={noop}
      onLoadMore={noop}
      onItemClick={noop}
      hasMore={true}
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DrillDownList
      category="music"
      categoryLabel="Music & Entertainment"
      categoryColor="#EC4899"
      items={[]}
      total={0}
      loading={false}
      onSearch={noop}
      onLoadMore={noop}
      onItemClick={noop}
      hasMore={false}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <DrillDownList
      category="knowledge"
      categoryLabel="Documents & Notes"
      categoryColor="#8B93A7"
      items={[]}
      total={15}
      loading={true}
      onSearch={noop}
      onLoadMore={noop}
      onItemClick={noop}
      hasMore={false}
    />
  ),
};

export const WithLoadMore: Story = {
  render: () => (
    <DrillDownList
      category="health"
      categoryLabel="Health & Fitness"
      categoryColor="#3DB87A"
      items={sampleItems.slice(0, 2)}
      total={12}
      loading={false}
      onSearch={noop}
      onLoadMore={noop}
      onItemClick={noop}
      hasMore={true}
    />
  ),
};
