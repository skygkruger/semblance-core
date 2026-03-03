import type { Meta, StoryObj } from '@storybook/react';
import { MessageDraftCard } from './MessageDraftCard';

const meta: Meta<typeof MessageDraftCard> = {
  title: 'Desktop/Inbox/MessageDraftCard',
  component: MessageDraftCard,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof MessageDraftCard>;

export const GuardianTier: Story = {
  args: {
    recipientName: 'Sarah Chen',
    maskedPhone: '(***) ***-4521',
    body: 'Running 10 minutes late to our lunch. See you at 12:40!',
    autonomyTier: 'guardian',
    onSend: () => {},
    onEdit: () => {},
    onCancel: () => {},
  },
};

export const PartnerTierCountdown: Story = {
  args: {
    recipientName: 'Alex Rivera',
    maskedPhone: '(***) ***-8832',
    body: 'Thanks for the sprint notes — I\'ll review them before our 3 PM meeting.',
    autonomyTier: 'partner',
    onSend: () => {},
    onEdit: () => {},
    onCancel: () => {},
  },
};

export const AlterEgoTier: Story = {
  args: {
    recipientName: 'Dana Kim',
    maskedPhone: '(***) ***-1190',
    body: 'Confirmed for Thursday dinner at 7 PM. Looking forward to it.',
    autonomyTier: 'alter_ego',
    onSend: () => {},
    onEdit: () => {},
    onCancel: () => {},
  },
};
