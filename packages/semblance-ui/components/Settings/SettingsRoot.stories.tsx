import type { Meta, StoryObj } from '@storybook/react';
import { SettingsRoot } from './SettingsRoot';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SettingsRoot> = {
  title: 'Settings/SettingsRoot',
  component: SettingsRoot,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsRoot>;

export const Default: Story = {
  args: {
    currentModel: 'llama3.2:3b',
    activeConnections: 12,
    notificationSummary: 'Daily · 8:00 AM',
    autonomyTier: 'partner',
    privacyStatus: 'clean',
    licenseStatus: 'founding-member',
    appVersion: 'Semblance v0.1.0',
    onNavigate: (screen) => console.log('Navigate to:', screen),
  },
};

export const PrivacyReviewNeeded: Story = {
  args: {
    ...Default.args,
    privacyStatus: 'review-needed',
  },
};

export const Free: Story = {
  args: {
    ...Default.args,
    licenseStatus: 'free',
    activeConnections: 3,
  },
};

export const Mobile: Story = {
  args: { ...Default.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
