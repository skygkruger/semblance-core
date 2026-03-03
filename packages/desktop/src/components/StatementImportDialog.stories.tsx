import type { Meta, StoryObj } from '@storybook/react';
import { StatementImportDialog } from './StatementImportDialog';

const meta: Meta<typeof StatementImportDialog> = {
  title: 'Desktop/Finance/StatementImportDialog',
  component: StatementImportDialog,
  parameters: { layout: 'fullscreen' },
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
