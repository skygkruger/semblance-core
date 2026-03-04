import type { Meta, StoryObj } from '@storybook/react';
import { DocumentPanel } from './DocumentPanel';

const meta: Meta<typeof DocumentPanel> = {
  title: 'Chat/DocumentPanel',
  component: DocumentPanel,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'flex-end', padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DocumentPanel>;

export const WithFiles: Story = {
  args: {
    open: true,
    files: [
      { id: 'f1', fileName: 'Q4-2025-taxes.pdf', sizeBytes: 2457600, status: 'ready', addedToKnowledge: false },
      { id: 'f2', fileName: 'bank-statement-dec.csv', sizeBytes: 184320, status: 'ready', addedToKnowledge: true },
      { id: 'f3', fileName: 'health-records-2025.pdf', sizeBytes: 5242880, status: 'processing' },
      { id: 'f4', fileName: 'corrupted-file.doc', sizeBytes: 0, status: 'error', error: 'Unsupported format' },
    ],
    onClose: () => {},
    onRemoveFile: () => {},
    onAddToKnowledge: () => {},
    onAttach: () => {},
  },
};

export const Empty: Story = {
  args: {
    open: true,
    files: [],
    onClose: () => {},
    onRemoveFile: () => {},
    onAddToKnowledge: () => {},
    onAttach: () => {},
  },
};

export const AllProcessed: Story = {
  args: {
    open: true,
    files: [
      { id: 'f1', fileName: 'meeting-notes-jan.md', sizeBytes: 12800, status: 'ready', addedToKnowledge: true },
      { id: 'f2', fileName: 'project-brief.pdf', sizeBytes: 512000, status: 'ready', addedToKnowledge: true },
      { id: 'f3', fileName: 'receipts-2025.csv', sizeBytes: 98304, status: 'ready', addedToKnowledge: false },
    ],
    onClose: () => {},
    onRemoveFile: () => {},
    onAddToKnowledge: () => {},
    onAttach: () => {},
  },
};
