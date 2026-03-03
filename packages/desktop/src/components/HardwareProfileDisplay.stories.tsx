import type { Meta, StoryObj } from '@storybook/react';
import { HardwareProfileDisplay } from './HardwareProfileDisplay';

const meta: Meta<typeof HardwareProfileDisplay> = {
  title: 'Desktop/Onboarding/HardwareProfileDisplay',
  component: HardwareProfileDisplay,
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
type Story = StoryObj<typeof HardwareProfileDisplay>;

export const WorkstationFull: Story = {
  args: {
    hardware: {
      tier: 'workstation',
      totalRamMb: 65536,
      cpuCores: 16,
      gpuName: 'NVIDIA RTX 4090',
      gpuVramMb: 24576,
      os: 'Windows 11',
      arch: 'x86_64',
    },
  },
};

export const PerformanceMac: Story = {
  args: {
    hardware: {
      tier: 'performance',
      totalRamMb: 32768,
      cpuCores: 12,
      gpuName: 'Apple M3 Pro (18-core GPU)',
      gpuVramMb: null,
      os: 'macOS 15.3',
      arch: 'arm64',
    },
  },
};

export const StandardNoGpu: Story = {
  args: {
    hardware: {
      tier: 'standard',
      totalRamMb: 16384,
      cpuCores: 8,
      gpuName: null,
      gpuVramMb: null,
      os: 'Ubuntu 24.04',
      arch: 'x86_64',
    },
  },
};

export const ConstrainedCompact: Story = {
  args: {
    hardware: {
      tier: 'constrained',
      totalRamMb: 8192,
      cpuCores: 4,
      gpuName: null,
      gpuVramMb: null,
      os: 'Windows 10',
      arch: 'x86_64',
    },
    compact: true,
  },
};
