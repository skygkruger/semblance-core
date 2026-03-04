import { useState, useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AlterEgoReceipt } from './AlterEgoReceipt';
import type { AlterEgoReceiptProps } from './AlterEgoReceipt.types';
import { DotMatrix } from '../DotMatrix/DotMatrix';

const meta: Meta<typeof AlterEgoReceipt> = {
  title: 'AlterEgo/Receipt',
  component: AlterEgoReceipt,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0B0E11', overflow: 'hidden' }}>
        <DotMatrix />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 440 }}>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AlterEgoReceipt>;

/** Wrapper that computes a fresh undoExpiresAt on mount so the countdown always works */
function FreshUndoReceipt({ undoSeconds, ...props }: Omit<AlterEgoReceiptProps, 'undoExpiresAt'> & { undoSeconds: number }) {
  const [expiresAt] = useState(() => new Date(Date.now() + undoSeconds * 1000).toISOString());
  return <AlterEgoReceipt {...props} undoExpiresAt={expiresAt} />;
}

export const WithUndoWindow: Story = {
  render: () => (
    <FreshUndoReceipt
      id="receipt-001"
      summary="Cancelled Figma subscription ($15/mo)"
      reasoning="Unused for 47 days. Annual savings: $180."
      undoSeconds={5}
      onUndo={() => {}}
      onDismiss={() => {}}
    />
  ),
};

export const UndoExpired: Story = {
  args: {
    id: 'receipt-002',
    summary: 'Archived 23 promotional emails',
    reasoning: 'All from mailing lists, none opened in 30+ days.',
    undoExpiresAt: new Date(Date.now() - 5000).toISOString(),
    onUndo: () => {},
    onDismiss: () => {},
  },
};

export const NoUndoAvailable: Story = {
  args: {
    id: 'receipt-003',
    summary: 'Sent weekly digest to sky@veridian.run',
    reasoning: '12 actions summarized, 47 minutes saved this week.',
    undoExpiresAt: null,
    onUndo: () => {},
    onDismiss: () => {},
  },
};

export const FinancialAction: Story = {
  render: () => (
    <FreshUndoReceipt
      id="receipt-004"
      summary="Transferred $2,400 to savings account"
      reasoning="Checking balance exceeded typical monthly need based on 6 months of data."
      undoSeconds={10}
      onUndo={() => {}}
      onDismiss={() => {}}
    />
  ),
};
