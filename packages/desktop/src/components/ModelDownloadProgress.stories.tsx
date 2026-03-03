import type { Meta, StoryObj } from '@storybook/react';
import { ModelDownloadProgress } from './ModelDownloadProgress';

const meta: Meta<typeof ModelDownloadProgress> = {
  title: 'Desktop/Onboarding/ModelDownloadProgress',
  component: ModelDownloadProgress,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ModelDownloadProgress>;

export const SingleDownloading: Story = {
  args: {
    downloads: [
      {
        modelName: 'Llama 3.2 3B Q4_K_M',
        totalBytes: 2_147_483_648,
        downloadedBytes: 1_288_490_189,
        speedBytesPerSec: 52_428_800,
        status: 'downloading',
      },
    ],
  },
};

export const MultipleStates: Story = {
  args: {
    downloads: [
      {
        modelName: 'Llama 3.2 3B Q4_K_M',
        totalBytes: 2_147_483_648,
        downloadedBytes: 2_147_483_648,
        speedBytesPerSec: 0,
        status: 'complete',
      },
      {
        modelName: 'all-MiniLM-L6-v2 (Embeddings)',
        totalBytes: 91_226_112,
        downloadedBytes: 45_613_056,
        speedBytesPerSec: 31_457_280,
        status: 'downloading',
      },
      {
        modelName: 'Whisper Small (STT)',
        totalBytes: 154_140_672,
        downloadedBytes: 0,
        speedBytesPerSec: 0,
        status: 'pending',
      },
    ],
  },
};

export const WithError: Story = {
  args: {
    downloads: [
      {
        modelName: 'Llama 3.2 3B Q4_K_M',
        totalBytes: 2_147_483_648,
        downloadedBytes: 536_870_912,
        speedBytesPerSec: 0,
        status: 'error',
        error: 'Connection timed out. Check your network and try again.',
      },
    ],
    onRetry: () => {},
  },
};

export const Verifying: Story = {
  args: {
    downloads: [
      {
        modelName: 'Llama 3.2 3B Q4_K_M',
        totalBytes: 2_147_483_648,
        downloadedBytes: 2_147_483_648,
        speedBytesPerSec: 0,
        status: 'verifying',
      },
    ],
  },
};
