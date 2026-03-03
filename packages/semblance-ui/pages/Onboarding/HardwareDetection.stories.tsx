import type { Meta, StoryObj } from '@storybook/react';
import { HardwareDetection } from './HardwareDetection';

const meta: Meta<typeof HardwareDetection> = {
  title: 'Onboarding/HardwareDetection',
  component: HardwareDetection,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof HardwareDetection>;

export const Detecting: Story = {
  args: {
    detecting: true,
    onContinue: () => {},
  },
};

export const CapableTier: Story = {
  args: {
    detecting: false,
    hardwareInfo: {
      tier: 'capable',
      totalRamMb: 32768,
      cpuCores: 12,
      gpuName: 'NVIDIA RTX 4070',
      gpuVramMb: 12288,
      os: 'Windows 11',
      arch: 'x86_64',
    },
    onContinue: () => {},
  },
};

export const StandardTier: Story = {
  args: {
    detecting: false,
    hardwareInfo: {
      tier: 'standard',
      totalRamMb: 16384,
      cpuCores: 8,
      gpuName: 'Intel Iris Xe',
      gpuVramMb: 0,
      os: 'macOS 14',
      arch: 'arm64',
    },
    onContinue: () => {},
  },
};

export const ConstrainedTier: Story = {
  args: {
    detecting: false,
    hardwareInfo: {
      tier: 'constrained',
      totalRamMb: 8192,
      cpuCores: 4,
      os: 'Ubuntu 22.04',
      arch: 'x86_64',
    },
    onContinue: () => {},
  },
};

export const Mobile: Story = {
  args: {
    detecting: false,
    hardwareInfo: {
      tier: 'capable',
      totalRamMb: 8192,
      cpuCores: 6,
      gpuName: 'Apple A17 Pro',
      os: 'iOS 17',
      arch: 'arm64',
    },
    onContinue: () => {},
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
