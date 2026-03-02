// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlterEgoBatchReview } from '../../packages/semblance-ui/components/AlterEgoBatchReview/AlterEgoBatchReview.web';
import type { BatchItem } from '../../packages/semblance-ui/components/AlterEgoBatchReview/AlterEgoBatchReview.types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

function makeBatchItems(count: number): BatchItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    actionType: i % 2 === 0 ? 'email.send' : 'calendar.create',
    summary: `Action summary ${i + 1}`,
    reasoning: `Reasoning for action ${i + 1}`,
    category: i % 2 === 0 ? 'email' : 'calendar',
    createdAt: new Date().toISOString(),
  }));
}

describe('AlterEgoBatchReview', () => {
  const defaultItems = makeBatchItems(3);
  const baseProps = {
    items: defaultItems,
    onConfirm: vi.fn(),
  };

  it('renders all batch items', () => {
    render(<AlterEgoBatchReview {...baseProps} />);

    expect(screen.getByText('Action summary 1')).toBeInTheDocument();
    expect(screen.getByText('Action summary 2')).toBeInTheDocument();
    expect(screen.getByText('Action summary 3')).toBeInTheDocument();
  });

  it('renders category for each item', () => {
    render(<AlterEgoBatchReview {...baseProps} />);

    // Items 1 and 3 are email, item 2 is calendar
    const emailLabels = screen.getAllByText('email');
    expect(emailLabels.length).toBe(2);

    const calendarLabels = screen.getAllByText('calendar');
    expect(calendarLabels.length).toBe(1);
  });

  it('renders Approve All button', () => {
    render(<AlterEgoBatchReview {...baseProps} />);
    expect(screen.getByText('alter_ego.approve_all')).toBeInTheDocument();
  });

  it('renders Reject All button', () => {
    render(<AlterEgoBatchReview {...baseProps} />);
    expect(screen.getByText('alter_ego.reject_all')).toBeInTheDocument();
  });

  it('calls onConfirm when Confirm is clicked', () => {
    const onConfirm = vi.fn();
    render(<AlterEgoBatchReview items={defaultItems} onConfirm={onConfirm} />);

    // All items are approved by default
    const confirmButton = screen.getByText('button.confirm');
    fireEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);

    // All 3 items should be approved, none rejected
    const [approvedIds, rejectedIds] = onConfirm.mock.calls[0] as [string[], string[]];
    expect(approvedIds).toHaveLength(3);
    expect(rejectedIds).toHaveLength(0);
    expect(approvedIds).toContain('item-1');
    expect(approvedIds).toContain('item-2');
    expect(approvedIds).toContain('item-3');
  });
});
