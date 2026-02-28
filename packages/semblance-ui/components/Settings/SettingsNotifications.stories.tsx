import type { Meta, StoryObj } from '@storybook/react';
import { SettingsNotifications } from './SettingsNotifications';

const meta: Meta<typeof SettingsNotifications> = {
  title: 'Settings/SettingsNotifications',
  component: SettingsNotifications,
  parameters: {
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof SettingsNotifications>;

export const Default: Story = {
  args: {
    morningBriefEnabled: true,
    morningBriefTime: '08:00',
    includeWeather: true,
    includeCalendar: true,
    remindersEnabled: true,
    defaultSnoozeDuration: '15m',
    notifyOnAction: true,
    notifyOnApproval: true,
    actionDigest: 'daily',
    badgeCount: true,
    soundEffects: false,
    onChange: (key, value) => console.log('Change:', key, value),
    onBack: () => console.log('Back'),
  },
};

export const Mobile: Story = {
  args: { ...Default.args },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
