import type { Meta, StoryObj } from '@storybook/react';
import { CloudFolderPicker } from './CloudFolderPicker';

const meta: Meta<typeof CloudFolderPicker> = {
  title: 'Desktop/Settings/CloudFolderPicker',
  component: CloudFolderPicker,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof CloudFolderPicker>;

// Uses mocked cloudStorageBrowseFolders from the Vite plugin.
// Default mock returns [] — shows "No folders found" state.
export const EmptyFolders: Story = {
  args: {
    provider: 'google_drive',
    isOpen: true,
    onClose: () => {},
    onSelect: () => {},
  },
};

export const Closed: Story = {
  args: {
    provider: 'google_drive',
    isOpen: false,
    onClose: () => {},
    onSelect: () => {},
  },
};
