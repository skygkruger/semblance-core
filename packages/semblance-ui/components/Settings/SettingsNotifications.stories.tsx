import type { Meta, StoryObj } from '@storybook/react';
import { SettingsNotifications } from './SettingsNotifications';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof SettingsNotifications> = {
  title: 'Settings/SettingsNotifications',
  component: SettingsNotifications,
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
