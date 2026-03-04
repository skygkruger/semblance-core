import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'Primitives/ProgressBar',
  component: ProgressBar,
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 400 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Empty: Story = {
  args: { value: 0, max: 100 },
};

export const Quarter: Story = {
  args: { value: 25, max: 100 },
};

export const Half: Story = {
  args: { value: 50, max: 100 },
};

export const ThreeQuarter: Story = {
  args: { value: 75, max: 100 },
};

export const Complete: Story = {
  args: { value: 100, max: 100 },
};

export const Indeterminate: Story = {
  args: { indeterminate: true },
};

export const CustomMax: Story = {
  args: { value: 7, max: 12 },
};
