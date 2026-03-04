import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { ClipboardSettingsSection } from './ClipboardSettingsSection';
import '@semblance/ui/components/Settings/Settings.css';

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const meta: Meta<typeof ClipboardSettingsSection> = {
  title: 'Desktop/Settings/ClipboardSettingsSection',
  component: ClipboardSettingsSection,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <div className="settings-screen">
            <div className="settings-header">
              <button type="button" className="settings-header__back"><BackArrow /></button>
              <h1 className="settings-header__title">Clipboard</h1>
            </div>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ClipboardSettingsSection>;

/** Monitoring disabled — default state. */
export const Disabled: Story = {
  args: {
    monitoringEnabled: false,
    recentActions: [],
  },
};

/** Monitoring enabled with recent actions visible. */
export const Enabled: Story = {
  args: {
    monitoringEnabled: true,
    recentActions: [
      { patternType: 'Tracking Number', action: 'Created delivery tracker', timestamp: new Date(Date.now() - 120_000).toISOString() },
      { patternType: 'Flight Code', action: 'Added to calendar', timestamp: new Date(Date.now() - 300_000).toISOString() },
      { patternType: 'URL', action: 'Saved to reading list', timestamp: new Date(Date.now() - 600_000).toISOString() },
      { patternType: 'Address', action: 'Saved location', timestamp: new Date(Date.now() - 900_000).toISOString() },
    ],
  },
};

/** Interactive toggle — click to see both states. */
export const Interactive: Story = {
  render: () => {
    const [enabled, setEnabled] = useState(false);
    const actions = enabled
      ? [
          { patternType: 'Tracking Number', action: 'Created delivery tracker', timestamp: new Date(Date.now() - 120_000).toISOString() },
          { patternType: 'Flight Code', action: 'Added to calendar', timestamp: new Date(Date.now() - 300_000).toISOString() },
          { patternType: 'URL', action: 'Saved to reading list', timestamp: new Date(Date.now() - 600_000).toISOString() },
        ]
      : [];
    return (
      <ClipboardSettingsSection
        monitoringEnabled={enabled}
        recentActions={actions}
        onToggle={() => setEnabled(prev => !prev)}
      />
    );
  },
};
