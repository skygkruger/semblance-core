import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { EmailCard } from './EmailCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof EmailCard> = {
  title: 'Desktop/Inbox/EmailCard',
  component: EmailCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof EmailCard>;

export const UnreadHighPriority: Story = {
  args: {
    email: {
      id: 'e-1',
      messageId: 'msg-001',
      from: 'sarah@company.com',
      fromName: 'Sarah Chen',
      subject: 'Q1 Budget Approval — needs your sign-off',
      snippet: 'Hi, the finance team has finalized the Q1 budget. We need your approval by end of day to proceed with...',
      receivedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
      isRead: false,
      isStarred: false,
      hasAttachments: true,
      priority: 'high',
    },
    aiCategory: ['finance', 'approval'],
    aiPriority: 'high',
    actionTaken: null,
    onReply: () => {},
    onArchive: () => {},
    onSnooze: () => {},
    onExpand: () => {},
  },
};

export const ReadNormalPriority: Story = {
  args: {
    email: {
      id: 'e-2',
      messageId: 'msg-002',
      from: 'newsletter@techdigest.com',
      fromName: 'Tech Digest Weekly',
      subject: 'This Week in AI: New open-source models, inference breakthroughs',
      snippet: 'A roundup of the most significant developments in AI this week, including new model releases from...',
      receivedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      isRead: true,
      isStarred: false,
      hasAttachments: false,
      priority: 'low',
    },
    aiCategory: ['newsletter'],
    aiPriority: 'low',
    actionTaken: null,
    onReply: () => {},
    onArchive: () => {},
    onSnooze: () => {},
    onExpand: () => {},
  },
};

export const WithActionTaken: Story = {
  args: {
    email: {
      id: 'e-3',
      messageId: 'msg-003',
      from: 'alex@company.com',
      fromName: 'Alex Rivera',
      subject: 'Re: Sprint retrospective notes',
      snippet: 'Thanks for sharing. I\'ve added a few comments to the doc...',
      receivedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      isRead: true,
      isStarred: false,
      hasAttachments: false,
      priority: 'normal',
    },
    aiCategory: ['team', 'project'],
    aiPriority: 'normal',
    actionTaken: {
      type: 'archived',
      timestamp: new Date().toISOString(),
      undoAvailable: true,
      description: 'Archived — informational reply',
    },
    onReply: () => {},
    onArchive: () => {},
    onSnooze: () => {},
    onExpand: () => {},
  },
};
