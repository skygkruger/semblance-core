import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from './DotMatrix';

const meta: Meta<typeof DotMatrix> = {
  title: 'Background/DotMatrix',
  component: DotMatrix,
};

export default meta;
type Story = StoryObj<typeof DotMatrix>;

export const Default: Story = {
  args: { width: 800, height: 500 },
};

export const Mobile: Story = {
  args: { mobile: true, width: 390, height: 600 },
};

export const Isolated: Story = {
  args: { width: 400, height: 300 },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--base)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
};
