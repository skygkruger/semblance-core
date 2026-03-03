import type { Meta, StoryObj } from '@storybook/react';
import { ToastContainer } from './Toast';

const meta: Meta<typeof ToastContainer> = {
  title: 'Primitives/Toast',
  component: ToastContainer,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'void', values: [{ name: 'void', value: '#0B0E11' }] },
  },
  decorators: [
    (Story) => (
      <div style={{ background: '#0B0E11', minHeight: '100vh', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ToastContainer>;

export const InfoToast: Story = {
  args: {
    toasts: [
      { id: 't1', message: 'Indexing 23 new documents from your email.', variant: 'info' },
    ],
    onDismiss: () => {},
  },
};

export const SuccessToast: Story = {
  args: {
    toasts: [
      { id: 't1', message: 'Figma subscription cancelled. $15/mo saved.', variant: 'success' },
    ],
    onDismiss: () => {},
  },
};

export const AttentionToast: Story = {
  args: {
    toasts: [
      { id: 't1', message: 'Unusual login detected on your Gmail account.', variant: 'attention' },
    ],
    onDismiss: () => {},
  },
};

export const ActionToast: Story = {
  args: {
    toasts: [
      {
        id: 't1',
        message: 'Draft email ready for Jordan. Review before sending?',
        variant: 'action',
        action: (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ background: 'rgba(110, 207, 163, 0.12)', border: '1px solid rgba(110, 207, 163, 0.3)', borderRadius: 4, color: '#6ECFA3', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Review</button>
            <button style={{ background: 'none', border: '1px solid rgba(133, 147, 164, 0.25)', borderRadius: 4, color: '#8593A4', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}>Dismiss</button>
          </div>
        ),
      },
    ],
    onDismiss: () => {},
  },
};

export const MultipleToasts: Story = {
  args: {
    toasts: [
      { id: 't1', message: 'Weekly digest sent to sky@veridian.run.', variant: 'success' },
      { id: 't2', message: 'Dentist appointment moved to Thursday 2pm.', variant: 'info' },
      { id: 't3', message: 'Car insurance renewal due in 3 days.', variant: 'attention' },
    ],
    onDismiss: () => {},
  },
};
