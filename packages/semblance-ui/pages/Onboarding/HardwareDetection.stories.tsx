import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '../../components/DotMatrix/DotMatrix';
import { HardwareDetection } from './HardwareDetection';

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: '#0B0E11',
    overflow: 'hidden',
  }}>
    <DotMatrix />
    <div style={{
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 40,
    }}>
      {children}
    </div>
  </div>
);

const meta: Meta<typeof HardwareDetection> = {
  title: 'Onboarding/HardwareDetection',
  component: HardwareDetection,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <PageWrapper><Story /></PageWrapper>],
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
      <PageWrapper>
        <div style={{ maxWidth: 390, padding: 16 }}>
          <Story />
        </div>
      </PageWrapper>
    ),
  ],
};
