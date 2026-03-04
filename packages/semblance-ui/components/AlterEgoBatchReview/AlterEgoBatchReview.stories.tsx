import type { Meta, StoryObj } from '@storybook/react';
import { AlterEgoBatchReview } from './AlterEgoBatchReview';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof AlterEgoBatchReview> = {
  title: 'AlterEgo/BatchReview',
  component: AlterEgoBatchReview,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AlterEgoBatchReview>;

const sampleItems = [
  {
    id: 'a1',
    summary: 'Send weekly digest to sky@veridian.run',
    category: 'email',
    reasoning: '12 actions summarized, 47 minutes saved this week. Consistent with previous 8 weekly digests.',
  },
  {
    id: 'a2',
    summary: 'Cancel Figma subscription ($15/mo)',
    category: 'financial_routine',
    reasoning: 'Last used 47 days ago. Annual cost: $180. No team members on this account.',
  },
  {
    id: 'a3',
    summary: 'Reschedule dentist to Thursday 2pm',
    category: 'calendar',
    reasoning: 'Conflict with standup at 10am. Thursday 2pm is the next available slot that works with your schedule.',
  },
  {
    id: 'a4',
    summary: 'Archive 23 promotional emails',
    category: 'email',
    reasoning: 'All from mailing lists. None opened in 30+ days. Labels preserved for search.',
  },
  {
    id: 'a5',
    summary: 'Transfer $2,400 to savings',
    category: 'financial_significant',
    reasoning: 'Checking balance exceeds your typical monthly need by $2,400 based on 6 months of spending data.',
  },
];

export const Default: Story = {
  args: {
    items: sampleItems,
    onConfirm: () => {},
  },
};

export const TwoItems: Story = {
  args: {
    items: sampleItems.slice(0, 2),
    onConfirm: () => {},
  },
};

export const SingleItem: Story = {
  args: {
    items: [sampleItems[2]],
    onConfirm: () => {},
  },
};
