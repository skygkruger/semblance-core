// Storybook stories for KnowledgeItemModal component.
// Full item detail with 5 curation actions and inline delete confirmation.

import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { KnowledgeItemModal } from './KnowledgeItemModal';
import { DotMatrix } from '../DotMatrix/DotMatrix';
import type { DrillDownItem } from './DrillDownList.types';

const DarkDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof KnowledgeItemModal> = {
  title: 'Components/KnowledgeGraph/KnowledgeItemModal',
  component: KnowledgeItemModal,
  parameters: { layout: 'fullscreen' },
  decorators: [DarkDecorator],
};

export default meta;
type Story = StoryObj<typeof KnowledgeItemModal>;

// ─── Sample item ───

const sampleItem: DrillDownItem = {
  chunkId: 'chunk-abc-123',
  title: 'Portland Contract Draft v3.pdf',
  preview: 'Service agreement between Acme Corp and Portland Regional Office for fiscal year 2026. This document outlines the terms of the engagement, deliverables, payment schedule, and termination clauses. Key changes from v2 include updated liability caps and revised SLA targets.',
  source: 'local_file',
  category: 'work',
  indexedAt: '2026-02-28T14:30:00Z',
  mimeType: 'application/pdf',
};

const emailItem: DrillDownItem = {
  chunkId: 'chunk-email-456',
  title: 'Re: Q3 Budget Review — Updated Numbers',
  preview: 'Hey Sarah, attached the updated numbers for the Q3 budget review. The variance on line 42 reflects the Portland contract adjustment we discussed. Let me know if you need the breakdown by department.',
  source: 'email',
  category: 'work',
  indexedAt: '2026-02-27T09:15:00Z',
  mimeType: 'message/rfc822',
};

const noop = () => {};

// ─── Stories ───

export const Default: Story = {
  render: () => (
    <KnowledgeItemModal
      item={sampleItem}
      onClose={noop}
      onRemove={noop}
      onDelete={noop}
      onRecategorize={noop}
      onReindex={noop}
      onOpenInChat={noop}
    />
  ),
};

export const EmailSource: Story = {
  render: () => (
    <KnowledgeItemModal
      item={emailItem}
      onClose={noop}
      onRemove={noop}
      onDelete={noop}
      onRecategorize={noop}
      onReindex={noop}
      onOpenInChat={noop}
    />
  ),
};

export const Reindexing: Story = {
  render: () => (
    <KnowledgeItemModal
      item={sampleItem}
      onClose={noop}
      onRemove={noop}
      onDelete={noop}
      onRecategorize={noop}
      onReindex={noop}
      onOpenInChat={noop}
      reindexing={true}
    />
  ),
};
