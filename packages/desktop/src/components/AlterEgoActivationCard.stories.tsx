import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { AlterEgoActivationCard } from './AlterEgoActivationCard';
import type { ActivationPromptData } from './AlterEgoActivationCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof AlterEgoActivationCard> = {
  title: 'Desktop/Autonomy/AlterEgoActivationCard',
  component: AlterEgoActivationCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof AlterEgoActivationCard>;

const fullPrompt: ActivationPromptData = {
  totalActions: 147,
  successRate: 96,
  domainsCovered: ['email', 'calendar', 'finance'],
  estimatedTimeSavedSeconds: 7200,
  differences: [
    {
      domain: 'Email',
      currentTier: 'Partner',
      description: 'Responds to routine emails without asking. Archives newsletters. Follows up on unanswered threads.',
      examples: ['Auto-reply to meeting confirmations', 'Archive marketing emails'],
    },
    {
      domain: 'Calendar',
      currentTier: 'Partner',
      description: 'Resolves scheduling conflicts and proposes alternatives without interrupting you.',
      examples: ['Reschedule overlapping meetings', 'Block focus time'],
    },
    {
      domain: 'Finance',
      currentTier: 'Guardian',
      description: 'Categorizes transactions and flags anomalies. Cancels forgotten subscriptions on your behalf.',
      examples: ['Flag duplicate charges', 'Cancel unused streaming services'],
    },
  ],
  safeguards: [
    'Every action is logged and reversible',
    'High-stakes actions still require your approval',
    'You can revoke Alter Ego access for any domain at any time',
    'Weekly digest summarizes all autonomous actions',
  ],
};

export const FullOffer: Story = {
  args: {
    prompt: fullPrompt,
    onActivate: () => {},
    onDecline: () => {},
  },
};

export const SingleDomain: Story = {
  args: {
    prompt: {
      totalActions: 42,
      successRate: 100,
      domainsCovered: ['email'],
      estimatedTimeSavedSeconds: 1800,
      differences: [
        {
          domain: 'Email',
          currentTier: 'Partner',
          description: 'Sends routine replies without asking. Archives and labels automatically.',
          examples: ['Reply to scheduling requests', 'Archive read receipts'],
        },
      ],
      safeguards: [
        'Every email action is logged and reversible',
        'Financial or legal emails still require approval',
      ],
    },
    onActivate: () => {},
    onDecline: () => {},
  },
};
