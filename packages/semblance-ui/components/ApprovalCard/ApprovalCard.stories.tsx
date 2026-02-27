import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ApprovalCard } from './ApprovalCard';

const meta: Meta<typeof ApprovalCard> = {
  title: 'Components/ApprovalCard',
  component: ApprovalCard,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div style={{ width: '100%', maxWidth: 420 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof ApprovalCard>;

export const PendingLow: Story = {
  args: {
    action: 'Send weekly digest email',
    context: 'Semblance will email your weekly summary to sky@veridian.run. This contains 12 action summaries and 3 calendar events.',
    dataOut: ['Email address', 'Action summaries (12)', 'Calendar titles (3)'],
    risk: 'low',
    state: 'pending',
  },
};

export const PendingMedium: Story = {
  args: {
    action: 'Cancel Figma subscription',
    context: 'Detected recurring charge of $15/mo. Last used 47 days ago. Cancellation requires contacting support@figma.com.',
    dataOut: ['Account email', 'Subscription ID'],
    risk: 'medium',
    state: 'pending',
  },
};

export const PendingHigh: Story = {
  args: {
    action: 'Transfer $2,400 to savings',
    context: 'Based on spending patterns, your checking balance exceeds your typical monthly need by $2,400.',
    dataOut: ['Bank account numbers', 'Transfer amount'],
    risk: 'high',
    state: 'pending',
  },
};

export const Approved: Story = {
  args: {
    action: 'Send weekly digest email',
    context: 'Approved and sent to sky@veridian.run.',
    risk: 'low',
    state: 'approved',
  },
};

export const DismissedLow: Story = {
  args: {
    action: 'Send weekly digest email',
    context: 'Dismissed — no action taken.',
    risk: 'low',
    state: 'dismissed',
  },
};

export const DismissedMedium: Story = {
  args: {
    action: 'Cancel Figma subscription',
    context: 'Dismissed — no action taken.',
    risk: 'medium',
    state: 'dismissed',
  },
};

export const DismissedHigh: Story = {
  args: {
    action: 'Transfer $2,400 to savings',
    context: 'Dismissed — no action taken.',
    risk: 'high',
    state: 'dismissed',
  },
};

export const Mobile: Story = {
  args: {
    action: 'Reschedule dentist appointment',
    context: 'Conflict detected with team standup at 10am. Suggested new time: 2pm Thursday.',
    dataOut: ['Calendar event details', 'Contact phone number'],
    risk: 'low',
    state: 'pending',
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
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
    action: 'Send weekly digest email',
    context: 'Semblance will email your weekly summary to sky@veridian.run.',
    dataOut: ['Email address', 'Action summaries (12)', 'Calendar titles (3)'],
    risk: 'low',
    state: 'pending',
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
        <ApprovalCard key={key} {...args} />
      </div>
    );
  },
};
