import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { DailyDigestCard } from './DailyDigestCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof DailyDigestCard> = {
  title: 'Desktop/Digest/DailyDigestCard',
  component: DailyDigestCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof DailyDigestCard>;

export const Default: Story = {
  args: {
    digest: {
      id: 'digest-2026-03-03',
      summary: 'Handled 12 emails, prepped 2 meetings, and created 3 reminders. Estimated 47 minutes saved.',
      totalActions: 17,
      timeSavedFormatted: '47 min',
      emailsHandled: 12,
      meetingsPrepped: 2,
      remindersCreated: 3,
      webSearches: 0,
      dismissed: false,
    },
    onDismiss: () => {},
  },
};

export const HighActivity: Story = {
  args: {
    digest: {
      id: 'digest-2026-03-02',
      summary: 'Exceptional day — 31 actions across all domains. You saved over 2 hours.',
      totalActions: 31,
      timeSavedFormatted: '2h 14min',
      emailsHandled: 18,
      meetingsPrepped: 5,
      remindersCreated: 4,
      webSearches: 4,
      dismissed: false,
    },
    onDismiss: () => {},
  },
};

export const Minimal: Story = {
  args: {
    digest: {
      id: 'digest-2026-03-01',
      summary: 'Quiet day. Archived a few emails and set one reminder.',
      totalActions: 3,
      timeSavedFormatted: '8 min',
      emailsHandled: 2,
      meetingsPrepped: 0,
      remindersCreated: 1,
      webSearches: 0,
      dismissed: false,
    },
    onDismiss: () => {},
  },
};
