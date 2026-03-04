import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { CloudFolderPicker } from './CloudFolderPicker';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 0 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof CloudFolderPicker> = {
  title: 'Desktop/Settings/CloudFolderPicker',
  component: CloudFolderPicker,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
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
