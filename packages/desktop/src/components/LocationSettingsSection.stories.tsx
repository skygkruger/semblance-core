import type { Meta, StoryObj } from '@storybook/react';
import { LocationSettingsSection } from './LocationSettingsSection';

const meta: Meta<typeof LocationSettingsSection> = {
  title: 'Desktop/Settings/LocationSettingsSection',
  component: LocationSettingsSection,
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
type Story = StoryObj<typeof LocationSettingsSection>;

// Uses mocked useAppState/useAppDispatch from the Vite plugin.
// Default mock state has location disabled.
export const Default: Story = {};
