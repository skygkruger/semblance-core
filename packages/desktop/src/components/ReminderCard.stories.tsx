import type { Meta, StoryObj } from '@storybook/react';
import { ReminderCard } from './ReminderCard';

const meta: Meta<typeof ReminderCard> = {
  title: 'Desktop/Inbox/ReminderCard',
  component: ReminderCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
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
