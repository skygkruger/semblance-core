import type { Meta, StoryObj } from '@storybook/react';
import { DirectoryPicker } from './DirectoryPicker';

const meta: Meta<typeof DirectoryPicker> = {
  title: 'Primitives/DirectoryPicker',
  component: DirectoryPicker,
  decorators: [
    (Story) => (
      <div style={{ width: '100%', maxWidth: 500 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DirectoryPicker>;

export const WithDirectories: Story = {
  args: {
    directories: [
      { path: '/Users/sky/Documents', fileCount: 1247, lastIndexed: '2 hours ago' },
      { path: '/Users/sky/Projects/semblance', fileCount: 892, lastIndexed: '15 minutes ago' },
      { path: '/Users/sky/Desktop', fileCount: 34, lastIndexed: '1 day ago' },
    ],
    onAdd: () => {},
    onRemove: () => {},
    onRescan: () => {},
  },
};

export const SingleDirectory: Story = {
  args: {
    directories: [
      { path: '/Users/sky/Documents', fileCount: 1247, lastIndexed: '5 minutes ago' },
    ],
    onAdd: () => {},
    onRemove: () => {},
    onRescan: () => {},
  },
};

export const EmptyState: Story = {
  args: {
    directories: [],
    onAdd: () => {},
    onRemove: () => {},
    onRescan: () => {},
  },
};

export const WithoutRescan: Story = {
  args: {
    directories: [
      { path: '/Users/sky/Documents', fileCount: 1247 },
      { path: '/Users/sky/Desktop', fileCount: 34 },
    ],
    onAdd: () => {},
    onRemove: () => {},
  },
};
