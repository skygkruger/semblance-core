import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { SoundSettingsSection } from './SoundSettingsSection';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof SoundSettingsSection> = {
  title: 'Desktop/Settings/SoundSettingsSection',
  component: SoundSettingsSection,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof SoundSettingsSection>;

// Uses mocked useAppState, useAppDispatch, useSound, saveSoundSettings,
// and SOUND_CATEGORY_LABELS from the Vite mock plugin.
// Default mock state has sound enabled with all category volumes at 1.0.
export const Default: Story = {};
