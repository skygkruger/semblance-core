import type { Meta, StoryObj } from '@storybook/react';
import { ClipboardInsightToast } from './ClipboardInsightToast';

const meta: Meta<typeof ClipboardInsightToast> = {
  title: 'Desktop/Clipboard/ClipboardInsightToast',
  component: ClipboardInsightToast,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof ClipboardInsightToast>;

export const TrackingNumber: Story = {
  args: {
    patternDescription: 'Looks like a UPS tracking number. Want to track this package?',
    actionLabel: 'Track Package',
    onAction: () => {},
    onDismiss: () => {},
    autoDismissMs: 60000,
  },
};

export const FlightCode: Story = {
  args: {
    patternDescription: 'Detected flight UA 2847. Add departure reminder to your calendar?',
    actionLabel: 'Add Reminder',
    onAction: () => {},
    onDismiss: () => {},
    autoDismissMs: 60000,
  },
};

export const Address: Story = {
  args: {
    patternDescription: 'Copied an address. Save it for your upcoming meeting at 2pm?',
    actionLabel: 'Save Location',
    onAction: () => {},
    onDismiss: () => {},
    autoDismissMs: 60000,
  },
};
