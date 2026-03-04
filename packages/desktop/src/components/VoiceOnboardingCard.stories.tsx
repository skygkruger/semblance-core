import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { VoiceOnboardingCard } from './VoiceOnboardingCard';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof VoiceOnboardingCard> = {
  title: 'Desktop/Voice/VoiceOnboardingCard',
  component: VoiceOnboardingCard,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof VoiceOnboardingCard>;

export const BothNeeded: Story = {
  args: {
    whisperDownloaded: false,
    piperDownloaded: false,
    whisperSizeMb: 147,
    piperSizeMb: 63,
    onDownloadWhisper: () => {},
    onDownloadPiper: () => {},
    downloading: false,
  },
};

export const WhisperDownloaded: Story = {
  args: {
    whisperDownloaded: true,
    piperDownloaded: false,
    whisperSizeMb: 147,
    piperSizeMb: 63,
    onDownloadWhisper: () => {},
    onDownloadPiper: () => {},
    downloading: false,
  },
};

export const Downloading: Story = {
  args: {
    whisperDownloaded: false,
    piperDownloaded: false,
    whisperSizeMb: 147,
    piperSizeMb: 63,
    onDownloadWhisper: () => {},
    onDownloadPiper: () => {},
    downloading: true,
  },
};
