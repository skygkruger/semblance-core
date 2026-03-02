// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlterEgoReceipt } from '../../packages/semblance-ui/components/AlterEgoReceipt/AlterEgoReceipt.web';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

function futureTimestamp(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function pastTimestamp(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

describe('AlterEgoReceipt', () => {
  const baseProps = {
    id: 'receipt-001',
    summary: 'Sent follow-up email to Alice',
    reasoning: 'She asked about the project timeline yesterday',
    undoExpiresAt: null as string | null,
    onUndo: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('renders summary text', () => {
    render(<AlterEgoReceipt {...baseProps} />);
    expect(screen.getByText('Sent follow-up email to Alice')).toBeInTheDocument();
  });

  it('renders reasoning text', () => {
    render(<AlterEgoReceipt {...baseProps} />);
    expect(screen.getByText('She asked about the project timeline yesterday')).toBeInTheDocument();
  });

  it('calls onUndo with id when Undo button clicked', () => {
    const onUndo = vi.fn();
    render(
      <AlterEgoReceipt
        {...baseProps}
        undoExpiresAt={futureTimestamp(30)}
        onUndo={onUndo}
      />,
    );

    const undoButton = screen.getByText('button.undo');
    fireEvent.click(undoButton);

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledWith('receipt-001');
  });

  it('calls onDismiss with id when dismiss button clicked', () => {
    const onDismiss = vi.fn();
    // With undoExpiresAt = null, the dismiss button (x) shows instead of undo
    render(
      <AlterEgoReceipt
        {...baseProps}
        onDismiss={onDismiss}
      />,
    );

    const dismissButton = screen.getByLabelText('a11y.dismiss');
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('receipt-001');
  });

  it('shows undo button when undoExpiresAt is in the future', () => {
    render(
      <AlterEgoReceipt
        {...baseProps}
        undoExpiresAt={futureTimestamp(60)}
      />,
    );

    const undoButton = screen.getByText('button.undo');
    expect(undoButton).toBeInTheDocument();
    expect(undoButton).not.toBeDisabled();
  });
});
