import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DotMatrix } from '@semblance/ui';
import { QuickCaptureInput } from './QuickCaptureInput';

const VoidDecorator = (Story: React.ComponentType) => (
  <div style={{ position: 'relative', minHeight: '100vh', background: '#0B0E11', padding: 32 }}>
    <DotMatrix />
    <div style={{ position: 'relative', zIndex: 1 }}>
      <Story />
    </div>
  </div>
);

const meta: Meta<typeof QuickCaptureInput> = {
  title: 'Desktop/Inbox/QuickCaptureInput',
  component: QuickCaptureInput,
  parameters: { layout: 'centered' },
  decorators: [VoidDecorator],
};

export default meta;
type Story = StoryObj<typeof QuickCaptureInput>;

export const Default: Story = {
  args: {
    onCapture: async () => ({
      hasReminder: false,
      reminderDueAt: null,
      linkedContextCount: 0,
    }),
  },
};

export const WithCustomPlaceholder: Story = {
  args: {
    onCapture: async () => ({
      hasReminder: true,
      reminderDueAt: '2026-03-04T09:00:00Z',
      linkedContextCount: 3,
    }),
    placeholder: 'What\'s on your mind?',
  },
};

export const Disabled: Story = {
  args: {
    onCapture: async () => ({
      hasReminder: false,
      reminderDueAt: null,
      linkedContextCount: 0,
    }),
    disabled: true,
  },
};
