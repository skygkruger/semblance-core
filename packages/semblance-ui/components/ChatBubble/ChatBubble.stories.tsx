import type { Meta, StoryObj } from '@storybook/react';
import { ChatBubble } from './ChatBubble';

const meta: Meta<typeof ChatBubble> = {
  title: 'Chat/ChatBubble',
  component: ChatBubble,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', padding: 40, width: '100%', maxWidth: 600 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ChatBubble>;

export const UserMessage: Story = {
  args: {
    role: 'user',
    content: 'Can you reschedule my dentist appointment to Thursday afternoon?',
    timestamp: '2:34 PM',
  },
};

export const AIMessage: Story = {
  args: {
    role: 'ai',
    content: 'I found your dentist appointment on Tuesday at 10am. There\'s an open slot Thursday at 2pm that doesn\'t conflict with your standup. I\'ll move it there and send Dr. Chen\'s office a heads up.',
    timestamp: '2:34 PM',
  },
};

export const AIStreaming: Story = {
  args: {
    role: 'ai',
    content: 'Looking at your calendar for Thursday afternoon',
    streaming: true,
  },
};

export const LongMessage: Story = {
  args: {
    role: 'ai',
    content: 'I\'ve analyzed your spending for the last 3 months. Here\'s what I found:\n\n- Food delivery: $847/mo average, down 23% from last quarter\n- Subscriptions: 14 active, 3 unused in 60+ days (Figma, Notion, Headspace)\n- Recurring bills: All on time, no anomalies\n- Savings rate: 18.4%, up from 15.2% last month\n\nThe three unused subscriptions total $43/mo. Want me to cancel them?',
    timestamp: '8:15 AM',
  },
};

export const Conversation: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ChatBubble role="user" content="What's on my calendar today?" timestamp="8:00 AM" />
      <ChatBubble role="ai" content="You have 3 meetings today: standup at 10am, design review at 1pm, and a 1:1 with Jordan at 3pm. Your afternoon is free after 4pm." timestamp="8:00 AM" />
      <ChatBubble role="user" content="Cancel the design review, I need that time to prep for Jordan." timestamp="8:01 AM" />
      <ChatBubble role="ai" content="Done. Cancelled the design review and notified the attendees. I've blocked 1-3pm as focus time for your 1:1 prep." timestamp="8:01 AM" />
    </div>
  ),
};
