import type { Meta, StoryObj } from '@storybook/react';
import { InsightCard } from './InsightCard';

const meta: Meta<typeof InsightCard> = {
  title: 'Desktop/Inbox/InsightCard',
  component: InsightCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof InsightCard>;

export const MeetingPrep: Story = {
  args: {
    insight: {
      id: 'ins-1',
      type: 'meeting_prep',
      priority: 'high',
      title: 'Product Review prep needed',
      summary: 'The attendees shared 3 documents yesterday. You have an unanswered question from Sarah about the timeline.',
      suggestedAction: { actionType: 'prepare_meeting', payload: {}, description: 'Prepare meeting notes' },
      createdAt: '2026-03-03T07:00:00Z',
    },
    onExecuteSuggestion: () => {},
    onDismiss: () => {},
    onExpand: () => {},
  },
};

export const FollowUp: Story = {
  args: {
    insight: {
      id: 'ins-2',
      type: 'follow_up',
      priority: 'normal',
      title: 'Follow up with Alex on budget',
      summary: 'You promised to send the updated figures by Friday. It\'s been 3 days since the last message.',
      suggestedAction: { actionType: 'draft_reply', payload: {}, description: 'Draft follow-up email' },
      createdAt: '2026-03-03T08:00:00Z',
    },
    onExecuteSuggestion: () => {},
    onDismiss: () => {},
    onExpand: () => {},
  },
};

export const Conflict: Story = {
  args: {
    insight: {
      id: 'ins-3',
      type: 'conflict',
      priority: 'high',
      title: 'Calendar conflict: Sprint Planning overlaps with 1:1',
      summary: 'Both events are at 3:00 PM today. Sprint planning has 8 attendees.',
      suggestedAction: null,
      createdAt: '2026-03-03T06:30:00Z',
    },
    onExecuteSuggestion: () => {},
    onDismiss: () => {},
    onExpand: () => {},
  },
};

export const Deadline: Story = {
  args: {
    insight: {
      id: 'ins-4',
      type: 'deadline',
      priority: 'high',
      title: 'Q1 report due tomorrow',
      summary: 'Finance shared the template last week. You haven\'t started yet.',
      suggestedAction: { actionType: 'create_reminder', payload: {}, description: 'Set a reminder for tonight' },
      createdAt: '2026-03-03T07:30:00Z',
    },
    onExecuteSuggestion: () => {},
    onDismiss: () => {},
    onExpand: () => {},
  },
};
