import type { Meta, StoryObj } from '@storybook/react';
import { QuickCaptureInput } from './QuickCaptureInput';

const meta: Meta<typeof QuickCaptureInput> = {
  title: 'Desktop/Inbox/QuickCaptureInput',
  component: QuickCaptureInput,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 480 }}>
        <Story />
      </div>
    ),
  ],
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
