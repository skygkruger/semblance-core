import type { Meta, StoryObj } from '@storybook/react';
import { CloudStorageSettingsSection } from './CloudStorageSettingsSection';

const meta: Meta<typeof CloudStorageSettingsSection> = {
  title: 'Desktop/Settings/CloudStorageSettingsSection',
  component: CloudStorageSettingsSection,
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
type Story = StoryObj<typeof CloudStorageSettingsSection>;

// Uses mocked useAppState, useAppDispatch, and IPC commands from the Vite plugin.
// Default mock state has cloud storage disconnected.
export const Default: Story = {};
