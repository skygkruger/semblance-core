import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BriefingCard } from './BriefingCard';

const meta: Meta<typeof BriefingCard> = {
  title: 'Components/BriefingCard',
  component: BriefingCard,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '100%', maxWidth: 480 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof BriefingCard>;

export const Default: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: 'FEB 26 08:12',
    items: [
      { type: 'action', text: 'Sent weekly digest to sky@veridian.run. 12 actions summarized, 47 minutes saved.' },
      { type: 'action', text: 'Rescheduled dentist to Thursday 2pm — resolved conflict with standup.' },
      { type: 'pending', text: 'Figma subscription renewal tomorrow ($15/mo). Last used 47 days ago.' },
      { type: 'insight', text: 'Sleep quality improving — 3rd consecutive week above 7h average.' },
      { type: 'insight', text: 'Spending 23% less on food delivery this month vs. last.' },
    ],
  },
};

export const Expanded: Story = {
  args: {
    title: 'Weekly Summary',
    timestamp: 'WEEK 9',
    items: [
      { type: 'action', text: 'Completed 34 autonomous actions across email, calendar, and finance.' },
      { type: 'action', text: 'Saved approximately 4.2 hours of manual work.' },
      { type: 'action', text: 'Cancelled unused Canva Pro subscription ($12.99/mo).' },
      { type: 'pending', text: 'AWS bill increased 18% — may want to review Lambda usage.' },
      { type: 'pending', text: 'Two meeting conflicts next Tuesday need resolution.' },
      { type: 'insight', text: 'Email response time down to 2.1 hours average (was 6.4h).' },
      { type: 'insight', text: 'Exercise frequency: 4x this week (target: 3x). On track.' },
      { type: 'insight', text: 'You have 3 upcoming renewals in the next 14 days.' },
    ],
  },
};

export const Mobile: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: 'FEB 26',
    items: [
      { type: 'action', text: 'Archived 8 promotional emails.' },
      { type: 'pending', text: 'Package arriving today — requires signature.' },
      { type: 'insight', text: 'Clear schedule after 2pm.' },
    ],
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 390, padding: 16, boxSizing: 'border-box' as const }}>
        <Story />
      </div>
    ),
  ],
};

export const WithAnimation: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: 'FEB 26 08:12',
    items: [
      { type: 'action', text: 'Sent weekly digest to sky@veridian.run. 12 actions summarized, 47 minutes saved.' },
      { type: 'action', text: 'Rescheduled dentist to Thursday 2pm — resolved conflict with standup.' },
      { type: 'pending', text: 'Figma subscription renewal tomorrow ($15/mo). Last used 47 days ago.' },
      { type: 'insight', text: 'Sleep quality improving — 3rd consecutive week above 7h average.' },
      { type: 'insight', text: 'Spending 23% less on food delivery this month vs. last.' },
    ],
  },
  render: function WithAnimationStory(args) {
    const [key, setKey] = useState(0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <button
          onClick={() => setKey((k) => k + 1)}
          style={{
            background: 'transparent',
            border: '1px solid var(--b2)',
            color: 'var(--sv3)',
            padding: '6px 16px',
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            fontFamily: 'DM Mono, monospace',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
          }}
        >
          Replay Animation
        </button>
        <BriefingCard key={key} {...args} />
      </div>
    );
  },
};
