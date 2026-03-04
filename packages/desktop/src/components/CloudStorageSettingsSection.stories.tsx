import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { CloudStorageSettingsSection } from './CloudStorageSettingsSection';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof CloudStorageSettingsSection> = {
  title: 'Desktop/Settings/CloudStorageSettingsSection',
  component: CloudStorageSettingsSection,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof CloudStorageSettingsSection>;

// Uses mocked useAppState, useAppDispatch, and IPC commands from the Vite plugin.
// Default mock state has cloud storage disconnected.
export const Default: Story = {};
