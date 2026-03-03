import type { Meta, StoryObj } from '@storybook/react';
import { DarkPatternBadge } from './DarkPatternBadge';

const meta: Meta<typeof DarkPatternBadge> = {
  title: 'Desktop/Safety/DarkPatternBadge',
  component: DarkPatternBadge,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DarkPatternBadge>;

export const UrgencyPattern: Story = {
  args: {
    flag: {
      contentId: 'email-1234',
      confidence: 0.87,
      patterns: [
        {
          category: 'false_urgency',
          evidence: 'Act now — this offer expires in 2 hours!',
          confidence: 0.92,
        },
        {
          category: 'scarcity',
          evidence: 'Only 3 seats left at this price',
          confidence: 0.78,
        },
      ],
      reframe: 'This email uses time pressure to rush your decision. The "deadline" may be artificial.',
    },
    onDismiss: () => {},
  },
};

export const ConfirmShaming: Story = {
  args: {
    flag: {
      contentId: 'email-5678',
      confidence: 0.73,
      patterns: [
        {
          category: 'confirmshaming',
          evidence: 'No thanks, I don\'t want to save money',
          confidence: 0.73,
        },
      ],
      reframe: 'The "decline" option is worded to make you feel bad about saying no.',
    },
  },
};

export const HiddenCost: Story = {
  args: {
    flag: {
      contentId: 'notif-9012',
      confidence: 0.81,
      patterns: [
        {
          category: 'hidden_cost',
          evidence: 'From $4.99/mo (billed annually at $119.88)',
          confidence: 0.81,
        },
      ],
      reframe: 'The monthly price shown requires an annual commitment. The actual cost is $119.88 upfront.',
    },
    onDismiss: () => {},
  },
};
