import type { Meta, StoryObj } from '@storybook/react';
import { FoundingMemberBadge } from './FoundingMemberBadge';

const meta: Meta<typeof FoundingMemberBadge> = {
  title: 'License/FoundingMemberBadge',
  component: FoundingMemberBadge,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['inline', 'card'] },
    seat: { control: { type: 'number', min: 1, max: 500 } },
  },
};

export default meta;
type Story = StoryObj<typeof FoundingMemberBadge>;

export const InlineBadge: Story = {
  args: {
    seat: 42,
    variant: 'inline',
  },
};

export const CardBadge: Story = {
  args: {
    seat: 42,
    variant: 'card',
  },
};

export const HighSeatNumber: Story = {
  args: {
    seat: 499,
    variant: 'card',
  },
};
