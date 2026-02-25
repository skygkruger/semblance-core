import type { Meta, StoryObj } from '@storybook/react';
import { StatusIndicator } from './StatusIndicator';

const meta: Meta<typeof StatusIndicator> = {
  title: 'Components/StatusIndicator',
  component: StatusIndicator,
  argTypes: {
    status: {
      control: 'select',
      options: ['success', 'accent', 'attention', 'muted'],
    },
    pulse: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof StatusIndicator>;

export const Success: Story = {
  args: { status: 'success' },
};

export const Accent: Story = {
  args: { status: 'accent' },
};

export const Attention: Story = {
  args: { status: 'attention' },
};

export const Muted: Story = {
  args: { status: 'muted' },
};

export const SuccessPulse: Story = {
  args: { status: 'success', pulse: true },
};

export const AttentionPulse: Story = {
  args: { status: 'attention', pulse: true },
};

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="success" />
        <span style={{ fontSize: 13, color: '#9BA0B0' }}>Success</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="accent" />
        <span style={{ fontSize: 13, color: '#9BA0B0' }}>Accent</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="attention" />
        <span style={{ fontSize: 13, color: '#9BA0B0' }}>Attention</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="muted" />
        <span style={{ fontSize: 13, color: '#9BA0B0' }}>Muted</span>
      </div>
    </div>
  ),
};

export const AllPulsing: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <StatusIndicator status="success" pulse />
      <StatusIndicator status="accent" pulse />
      <StatusIndicator status="attention" pulse />
      <StatusIndicator status="muted" pulse />
    </div>
  ),
};
