import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { CloudFolderPicker } from './CloudFolderPicker';

const meta: Meta<typeof CloudFolderPicker> = {
  title: 'Desktop/Settings/CloudFolderPicker',
  component: CloudFolderPicker,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', minHeight: '100vh' }}>
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CloudFolderPicker>;

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
