import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { CloudStorageSettingsSection } from './CloudStorageSettingsSection';
import '@semblance/ui/components/Settings/Settings.css';

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const meta: Meta<typeof CloudStorageSettingsSection> = {
  title: 'Desktop/Settings/CloudStorageSettingsSection',
  component: CloudStorageSettingsSection,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <div className="settings-screen">
            <div className="settings-header">
              <button type="button" className="settings-header__back"><BackArrow /></button>
              <h1 className="settings-header__title">Cloud Storage</h1>
            </div>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CloudStorageSettingsSection>;

/** Disconnected — default state. */
export const Disconnected: Story = {};

/** Connected with usage data and sync controls visible. */
export const Connected: Story = {
  args: {
    settingsOverride: {
      connected: true,
      provider: 'google_drive',
      userEmail: 'user@example.com',
      storageUsedBytes: 1_340_000_000,
      filesSynced: 247,
      lastSyncedAt: new Date(Date.now() - 1_800_000).toISOString(),
      storageBudgetGB: 5,
      syncIntervalMinutes: 30,
      maxFileSizeMB: 25,
    },
  },
};
