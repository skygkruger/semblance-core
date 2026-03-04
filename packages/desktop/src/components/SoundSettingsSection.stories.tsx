import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { SoundSettingsSection } from './SoundSettingsSection';
import '@semblance/ui/components/Settings/Settings.css';

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const meta: Meta<typeof SoundSettingsSection> = {
  title: 'Desktop/Settings/SoundSettingsSection',
  component: SoundSettingsSection,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <div className="settings-screen">
            <div className="settings-header">
              <button type="button" className="settings-header__back"><BackArrow /></button>
              <h1 className="settings-header__title">Sound</h1>
            </div>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SoundSettingsSection>;

export const Default: Story = {};
