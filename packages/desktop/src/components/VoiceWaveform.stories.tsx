import type { Meta, StoryObj } from '@storybook/react';
import { VoiceWaveform } from './VoiceWaveform';

const meta: Meta<typeof VoiceWaveform> = {
  title: 'Desktop/Voice/VoiceWaveform',
  component: VoiceWaveform,
  parameters: { layout: 'centered' },
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
