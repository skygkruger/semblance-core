import type { Meta, StoryObj } from '@storybook/react';
import { ActionCard } from './ActionCard';

const meta: Meta<typeof ActionCard> = {
  title: 'Components/ActionCard',
  component: ActionCard,
  argTypes: {
    status: {
      control: 'select',
      options: ['success', 'pending', 'error', 'rejected'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ActionCard>;

export const Success: Story = {
  args: {
    id: 'action-1',
    timestamp: '2 minutes ago',
    actionType: 'Email Sent',
    description: 'Replied to Sarah about the project deadline — confirmed Friday delivery.',
    status: 'success',
    autonomyTier: 'partner',
    detail: <p>Full email body was sent to sarah@example.com. Subject: &quot;Re: Project Deadline&quot;</p>,
  },
};

export const Pending: Story = {
  args: {
    id: 'action-2',
    timestamp: 'Just now',
    actionType: 'Calendar Update',
    description: 'Moved team standup to 10:30 AM to resolve scheduling conflict.',
    status: 'pending',
    autonomyTier: 'guardian',
  },
};

export const Error: Story = {
  args: {
    id: 'action-3',
    timestamp: '5 minutes ago',
    actionType: 'Subscription Cancel',
    description: 'Failed to cancel unused streaming service — authentication expired.',
    status: 'error',
    autonomyTier: 'alter_ego',
    detail: <p>Error: OAuth token expired. Re-authenticate to retry.</p>,
  },
};

export const Rejected: Story = {
  args: {
    id: 'action-4',
    timestamp: '1 hour ago',
    actionType: 'Email Draft',
    description: 'Draft reply to recruiter was rejected by user.',
    status: 'rejected',
    autonomyTier: 'guardian',
  },
};

export const Expanded: Story = {
  args: {
    id: 'action-5',
    timestamp: '10 minutes ago',
    actionType: 'Financial Alert',
    description: 'Detected duplicate charge of $49.99 from CloudService Inc.',
    status: 'success',
    autonomyTier: 'partner',
    detail: (
      <div>
        <p>Duplicate charge detected on Visa ending 4242.</p>
        <p style={{ marginTop: 8 }}>Original: Jan 15, 2026 — $49.99</p>
        <p>Duplicate: Jan 16, 2026 — $49.99</p>
        <p style={{ marginTop: 8 }}>Dispute initiated automatically via partner mode.</p>
      </div>
    ),
  },
};
