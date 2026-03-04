import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { VoiceWaveform } from './VoiceWaveform';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof VoiceWaveform> = {
  title: 'Desktop/Voice/VoiceWaveform',
  component: VoiceWaveform,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof VoiceWaveform>;

export const LowLevel: Story = {
  args: {
    level: 0.2,
    active: true,
  },
};

export const MediumLevel: Story = {
  args: {
    level: 0.5,
    active: true,
  },
};

export const HighLevel: Story = {
  args: {
    level: 0.9,
    active: true,
  },
};

export const CustomBars: Story = {
  args: {
    level: 0.6,
    active: true,
    bars: 9,
  },
};
