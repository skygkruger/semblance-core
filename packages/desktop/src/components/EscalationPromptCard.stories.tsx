import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { EscalationPromptCard } from './EscalationPromptCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof EscalationPromptCard> = {
  title: 'Desktop/Autonomy/EscalationPromptCard',
  component: EscalationPromptCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof EscalationPromptCard>;

export const GuardianToPartner: Story = {
  args: {
    prompt: {
      id: 'esc-001',
      type: 'guardian_to_partner',
      domain: 'email',
      actionType: 'email.archive',
      consecutiveApprovals: 12,
      message: 'You\'ve approved 12 consecutive email archive actions. Want Semblance to handle these automatically?',
      previewActions: [
        {
          description: 'Archive read newsletters',
          currentBehavior: 'Ask before archiving',
          newBehavior: 'Archive automatically after 24 hours',
          estimatedTimeSaved: '~2 min/day',
        },
        {
          description: 'Archive marketing emails',
          currentBehavior: 'Ask before archiving',
          newBehavior: 'Archive immediately, log in digest',
          estimatedTimeSaved: '~1 min/day',
        },
      ],
      createdAt: '2026-03-03T09:00:00Z',
      expiresAt: '2026-03-10T09:00:00Z',
      status: 'pending',
    },
    onAccepted: () => {},
    onDismissed: () => {},
  },
};

export const PartnerToAlterEgo: Story = {
  args: {
    prompt: {
      id: 'esc-002',
      type: 'partner_to_alterego',
      domain: 'calendar',
      actionType: 'calendar.create',
      consecutiveApprovals: 25,
      message: 'You\'ve trusted Semblance with 25 calendar actions. Ready for full autonomy over scheduling?',
      previewActions: [
        {
          description: 'Resolve scheduling conflicts',
          currentBehavior: 'Suggest resolution, wait for approval',
          newBehavior: 'Resolve automatically using your priority rules',
          estimatedTimeSaved: '~5 min/conflict',
        },
      ],
      createdAt: '2026-03-03T14:00:00Z',
      expiresAt: '2026-03-10T14:00:00Z',
      status: 'pending',
    },
    onAccepted: () => {},
    onDismissed: () => {},
  },
};
