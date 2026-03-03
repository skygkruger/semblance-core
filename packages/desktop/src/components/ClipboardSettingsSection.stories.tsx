import type { Meta, StoryObj } from '@storybook/react';
import { ClipboardSettingsSection } from './ClipboardSettingsSection';

const meta: Meta<typeof ClipboardSettingsSection> = {
  title: 'Desktop/Settings/ClipboardSettingsSection',
  component: ClipboardSettingsSection,
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
type Story = StoryObj<typeof ClipboardSettingsSection>;

// Uses mocked useAppState/useAppDispatch from the Vite plugin.
// Default mock state has clipboard monitoring disabled and empty recent actions.
export const Default: Story = {};
