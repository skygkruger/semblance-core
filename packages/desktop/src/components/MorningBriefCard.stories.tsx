import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { MorningBriefCard } from './MorningBriefCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof MorningBriefCard> = {
  title: 'Desktop/Morning Brief/MorningBriefCard',
  component: MorningBriefCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof MorningBriefCard>;

const baseBrief = {
  id: 'brief-2026-03-03',
  summary: 'You have a product review at 10 AM with 3 attendees. Two emails need follow-up from yesterday.',
  estimatedReadTimeSeconds: 45,
  dismissed: false,
  sections: [
    {
      type: 'calendar',
      title: 'Today\'s Schedule',
      items: [
        { id: 'cal-1', text: 'Product Review — 10:00 AM', context: '3 attendees', actionable: false },
        { id: 'cal-2', text: 'Lunch with Dana — 12:30 PM', context: 'Reservation confirmed', actionable: false },
        { id: 'cal-3', text: 'Sprint Planning — 3:00 PM', actionable: true, suggestedAction: 'Prepare sprint backlog' },
      ],
    },
    {
      type: 'email',
      title: 'Email Follow-ups',
      items: [
        { id: 'em-1', text: 'Re: Q1 Budget Approval — awaiting your sign-off', actionable: true, suggestedAction: 'Draft approval reply' },
        { id: 'em-2', text: 'Vendor contract renewal from Legal', context: 'Received yesterday', actionable: true },
      ],
    },
  ],
};

export const Default: Story = {
  args: {
    brief: baseBrief,
    onDismiss: () => {},
  },
};

export const LongRead: Story = {
  args: {
    brief: {
      ...baseBrief,
      estimatedReadTimeSeconds: 180,
      summary: 'Busy day ahead. 6 meetings, 4 emails needing attention, and a project deadline at 5 PM.',
    },
    onDismiss: () => {},
  },
};

export const SingleSection: Story = {
  args: {
    brief: {
      ...baseBrief,
      sections: [baseBrief.sections[0]],
      summary: 'Three meetings today. Sprint planning at 3 PM needs backlog preparation.',
    },
    onDismiss: () => {},
  },
};
