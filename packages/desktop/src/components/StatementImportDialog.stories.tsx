import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { StatementImportDialog } from './StatementImportDialog';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 0 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof StatementImportDialog> = {
  title: 'Desktop/Finance/StatementImportDialog',
  component: StatementImportDialog,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof StatementImportDialog>;

// The dialog manages its own phases internally (select → parsing → results → error).
// In Storybook it renders the initial "select" phase by default.
// The "Browse Files" button calls a dynamic Tauri import which fails silently in Storybook.

export const SelectPhase: Story = {
  args: {
    onClose: () => {},
    onImportComplete: () => {},
  },
};
