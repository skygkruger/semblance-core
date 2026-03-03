import type { Meta, StoryObj } from '@storybook/react';
import { SoundSettingsSection } from './SoundSettingsSection';

const meta: Meta<typeof SoundSettingsSection> = {
  title: 'Desktop/Settings/SoundSettingsSection',
  component: SoundSettingsSection,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SoundSettingsSection>;

// Uses mocked useAppState, useAppDispatch, useSound, saveSoundSettings,
// and SOUND_CATEGORY_LABELS from the Vite mock plugin.
// Default mock state has sound enabled with all category volumes at 1.0.
export const Default: Story = {};
