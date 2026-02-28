import type { Meta, StoryObj } from '@storybook/react';
import { StatusIndicator } from './StatusIndicator';

const meta: Meta<typeof StatusIndicator> = {
  title: 'Components/StatusIndicator',
  component: StatusIndicator,
  parameters: {
    backgrounds: {
      default: 'void',
      values: [{ name: 'void', value: '#0B0E11' }],
    },
    layout: 'centered',
  },
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
        <span style={{ fontSize: 13, color: '#8593A4' }}>Success</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="accent" />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Accent</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="attention" />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Attention</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="muted" />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Muted</span>
      </div>
    </div>
  ),
};

export const AllPulsing: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="success" pulse />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Success</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="accent" pulse />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Accent</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="attention" pulse />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Attention</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusIndicator status="muted" pulse />
        <span style={{ fontSize: 13, color: '#8593A4' }}>Muted</span>
      </div>
    </div>
  ),
};
