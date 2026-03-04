import type { Meta, StoryObj } from '@storybook/react';
import { ConversationHistoryPanel } from './ConversationHistoryPanel';

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

const sampleItems = [
  { id: 'c1', title: 'Dentist rescheduling', autoTitle: null, lastMessagePreview: 'Moved to Thursday 2pm', pinned: true, updatedAt: hoursAgo(1), createdAt: daysAgo(2) },
  { id: 'c2', title: null, autoTitle: 'Morning brief review', lastMessagePreview: 'Your sleep quality is improving...', pinned: false, updatedAt: hoursAgo(2), createdAt: hoursAgo(2) },
  { id: 'c3', title: 'Subscription audit', autoTitle: null, lastMessagePreview: '3 unused subscriptions found totaling $43/mo', pinned: false, updatedAt: hoursAgo(5), createdAt: daysAgo(1) },
  { id: 'c4', title: null, autoTitle: 'Weekly digest prep', lastMessagePreview: '12 actions summarized, 47 minutes saved', pinned: false, updatedAt: daysAgo(1), createdAt: daysAgo(1) },
  { id: 'c5', title: 'Tax document search', autoTitle: null, lastMessagePreview: 'Found 23 relevant documents across email and files', pinned: false, updatedAt: daysAgo(3), createdAt: daysAgo(3) },
  { id: 'c6', title: null, autoTitle: 'Calendar optimization', lastMessagePreview: 'Reduced meeting time by 4 hours this week', pinned: false, updatedAt: daysAgo(5), createdAt: daysAgo(5) },
  { id: 'c7', title: 'Investment rebalancing', autoTitle: null, lastMessagePreview: 'Portfolio drift detected in bonds allocation', pinned: true, updatedAt: daysAgo(8), createdAt: daysAgo(10) },
];

const meta: Meta<typeof ConversationHistoryPanel> = {
  title: 'Chat/ConversationHistoryPanel',
  component: ConversationHistoryPanel,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', display: 'flex', padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConversationHistoryPanel>;

export const Default: Story = {
  args: {
    items: sampleItems,
    activeId: 'c2',
    open: true,
    searchQuery: '',
    onSearchChange: () => {},
    onSelect: () => {},
    onNew: () => {},
    onPin: () => {},
    onUnpin: () => {},
    onRename: () => {},
    onDelete: () => {},
    onClose: () => {},
  },
};

export const Empty: Story = {
  args: {
    items: [],
    activeId: undefined,
    open: true,
    searchQuery: '',
    onSearchChange: () => {},
    onSelect: () => {},
    onNew: () => {},
    onPin: () => {},
    onUnpin: () => {},
    onRename: () => {},
    onDelete: () => {},
    onClose: () => {},
  },
};

export const WithSearchQuery: Story = {
  args: {
    items: sampleItems,
    activeId: undefined,
    open: true,
    searchQuery: 'subscription',
    onSearchChange: () => {},
    onSelect: () => {},
    onNew: () => {},
    onPin: () => {},
    onUnpin: () => {},
    onRename: () => {},
    onDelete: () => {},
    onClose: () => {},
  },
};
