import type { Meta, StoryObj } from '@storybook/react';
import { UpgradeEmailCapture } from './UpgradeEmailCapture';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof UpgradeEmailCapture> = {
  title: 'Components/UpgradeEmailCapture',
  component: UpgradeEmailCapture,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 440 }}>
            <Story />
          </div>
        </div>
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
