import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { ImportDigitalLifeView } from './ImportDigitalLifeView';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 0 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof ImportDigitalLifeView> = {
  title: 'Desktop/Settings/ImportDigitalLifeView',
  component: ImportDigitalLifeView,
  parameters: { layout: 'fullscreen' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof ImportDigitalLifeView>;

export const NotPremium: Story = {
  args: {
    isPremium: false,
  },
};

export const PremiumReady: Story = {
  args: {
    isPremium: true,
    onImport: () => {},
  },
};

export const WithProgress: Story = {
  args: {
    isPremium: true,
    progress: {
      phase: 'Indexing browser history',
      itemsProcessed: 1247,
      totalItems: 3800,
      isActive: true,
    },
    onImport: () => {},
  },
};

export const WithHistory: Story = {
  args: {
    isPremium: true,
    importHistory: [
      { id: 'h-1', sourceType: 'Browser History', format: 'Chrome Takeout JSON', importedAt: '2026-02-28T14:30:00Z', itemCount: 3842, status: 'complete' },
      { id: 'h-2', sourceType: 'Notes', format: 'Markdown folders', importedAt: '2026-02-25T10:15:00Z', itemCount: 217, status: 'complete' },
      { id: 'h-3', sourceType: 'Photos Metadata', format: 'JPEG EXIF', importedAt: '2026-02-20T08:00:00Z', itemCount: 12450, status: 'complete' },
    ],
    onImport: () => {},
  },
};
