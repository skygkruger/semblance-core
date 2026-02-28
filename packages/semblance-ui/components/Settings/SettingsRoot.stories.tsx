import type { Meta, StoryObj } from '@storybook/react';
import { SettingsRoot } from './SettingsRoot';

const meta: Meta<typeof SettingsRoot> = {
  title: 'Settings/SettingsRoot',
  component: SettingsRoot,
  parameters: {
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
    layout: 'fullscreen',
  },
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

export const Trial: Story = {
  args: {
    ...Default.args,
    licenseStatus: 'trial',
    activeConnections: 3,
  },
};

export const Mobile: Story = {
  args: { ...Default.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
