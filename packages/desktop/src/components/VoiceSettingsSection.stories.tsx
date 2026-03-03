import type { Meta, StoryObj } from '@storybook/react';
import { VoiceSettingsSection } from './VoiceSettingsSection';

const meta: Meta<typeof VoiceSettingsSection> = {
  title: 'Desktop/Settings/VoiceSettingsSection',
  component: VoiceSettingsSection,
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
type Story = StoryObj<typeof VoiceSettingsSection>;

// Uses mocked useAppState/useAppDispatch from the Vite plugin.
// Default mock state has voice disabled — this renders the toggle-off state.
export const Default: Story = {};
