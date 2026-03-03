import type { Meta, StoryObj } from '@storybook/react';
import { VoiceOnboardingCard } from './VoiceOnboardingCard';

const meta: Meta<typeof VoiceOnboardingCard> = {
  title: 'Desktop/Voice/VoiceOnboardingCard',
  component: VoiceOnboardingCard,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 420 }}>
        <Story />
      </div>
    ),
  ],
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
