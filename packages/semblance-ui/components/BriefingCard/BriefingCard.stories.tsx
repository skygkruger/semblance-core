import type { Meta, StoryObj } from '@storybook/react';
import { BriefingCard } from './BriefingCard';

const meta: Meta<typeof BriefingCard> = {
  title: 'Screens/MorningBrief',
  component: BriefingCard,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', width: '100%', padding: 40, boxSizing: 'border-box' as const }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BriefingCard>;

const defaultItems = [
  { type: 'action' as const, text: 'Sent weekly digest to sky@veridian.run. 12 actions summarized, 47 minutes saved.' },
  { type: 'action' as const, text: 'Rescheduled dentist to Thursday 2pm -- resolved conflict with standup.' },
  { type: 'pending' as const, text: 'Figma subscription renewal tomorrow ($15/mo). Last used 47 days ago.' },
  { type: 'insight' as const, text: 'Sleep quality improving -- 3rd consecutive week above 7h average.' },
  { type: 'insight' as const, text: 'Spending 23% less on food delivery this month vs. last.' },
];

export const Default: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: undefined,
    userName: 'Sky',
    isFoundingMember: false,
    items: defaultItems,
  },
};

export const FoundingMember: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: undefined,
    userName: 'Sky',
    isFoundingMember: true,
    foundingSeat: 1,
    items: defaultItems,
  },
};

export const Mobile: Story = {
  args: {
    title: 'Morning Brief',
    timestamp: undefined,
    userName: 'Sky',
    isFoundingMember: true,
    foundingSeat: 42,
    items: [
      { type: 'action' as const, text: 'Archived 8 promotional emails.' },
      { type: 'pending' as const, text: 'Package arriving today -- requires signature.' },
      { type: 'insight' as const, text: 'Clear schedule after 2pm.' },
    ],
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', width: '100%', maxWidth: 390, padding: 16, boxSizing: 'border-box' as const }}>
        <Story />
      </div>
    ),
  ],
};
