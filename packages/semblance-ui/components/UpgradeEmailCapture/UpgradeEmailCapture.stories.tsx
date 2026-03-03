import type { Meta, StoryObj } from '@storybook/react';
import { UpgradeEmailCapture } from './UpgradeEmailCapture';

const meta: Meta<typeof UpgradeEmailCapture> = {
  title: 'Components/UpgradeEmailCapture',
  component: UpgradeEmailCapture,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', padding: 40, width: '100%', maxWidth: 440 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof UpgradeEmailCapture>;

export const Default: Story = {
  args: {
    onSubmit: () => {},
  },
};

export const Loading: Story = {
  args: {
    onSubmit: () => {},
    loading: true,
  },
};
