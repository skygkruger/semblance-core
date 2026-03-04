import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { ReminderCard } from './ReminderCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof ReminderCard> = {
  title: 'Desktop/Inbox/ReminderCard',
  component: ReminderCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof ReminderCard>;

export const OneTimeReminder: Story = {
  args: {
    reminder: {
      id: 'rem-001',
      text: 'Follow up with Sarah about the Q1 budget approval',
      dueAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      recurrence: 'none',
      source: 'email',
    },
    onSnooze: () => {},
    onDismiss: () => {},
  },
};

export const RecurringWeekly: Story = {
  args: {
    reminder: {
      id: 'rem-002',
      text: 'Review and categorize this week\'s transactions',
      dueAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      recurrence: 'weekly',
      source: 'finance',
    },
    onSnooze: () => {},
    onDismiss: () => {},
  },
};

export const DailyReminder: Story = {
  args: {
    reminder: {
      id: 'rem-003',
      text: 'Check inbox for urgent client requests',
      dueAt: new Date(Date.now() - 30_000).toISOString(),
      recurrence: 'daily',
      source: 'quick-capture',
    },
    onSnooze: () => {},
    onDismiss: () => {},
  },
};
