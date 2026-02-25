import type { Meta, StoryObj } from '@storybook/react';
import { PrivacyBadge } from './PrivacyBadge';

const meta: Meta<typeof PrivacyBadge> = {
  title: 'Components/PrivacyBadge',
  component: PrivacyBadge,
  argTypes: {
    actionsToday: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof PrivacyBadge>;

export const Default: Story = {
  args: {},
};

export const WithActionCount: Story = {
  args: { actionsToday: 14 },
};

export const SingleAction: Story = {
  args: { actionsToday: 1 },
};

export const ZeroActions: Story = {
  args: { actionsToday: 0 },
};

export const HighActivity: Story = {
  args: { actionsToday: 127 },
};
