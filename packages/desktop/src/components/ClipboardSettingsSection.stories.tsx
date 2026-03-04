import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { ClipboardSettingsSection } from './ClipboardSettingsSection';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof ClipboardSettingsSection> = {
  title: 'Desktop/Settings/ClipboardSettingsSection',
  component: ClipboardSettingsSection,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof ClipboardSettingsSection>;

// Uses mocked useAppState/useAppDispatch from the Vite plugin.
// Default mock state has clipboard monitoring disabled and empty recent actions.
export const Default: Story = {};
