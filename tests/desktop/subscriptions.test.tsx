// @vitest-environment jsdom
// Tests for SubscriptionInsightCard — renders real component.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubscriptionInsightCard } from '@semblance/desktop/components/SubscriptionInsightCard';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

const forgottenCharges = [
  { id: '1', merchantName: 'Netflix', amount: -15.99, frequency: 'monthly' as const, confidence: 0.9, lastChargeDate: '2025-01-01', chargeCount: 12, estimatedAnnualCost: 191.88, status: 'forgotten' as const },
  { id: '2', merchantName: 'Hulu', amount: -7.99, frequency: 'monthly' as const, confidence: 0.8, lastChargeDate: '2025-01-05', chargeCount: 6, estimatedAnnualCost: 95.88, status: 'forgotten' as const },
];

const activeCharges = [
  { id: '3', merchantName: 'Spotify', amount: -9.99, frequency: 'monthly' as const, confidence: 0.95, lastChargeDate: '2025-01-10', chargeCount: 24, estimatedAnnualCost: 119.88, status: 'active' as const },
];

const allCharges = [...forgottenCharges, ...activeCharges];

const summary = {
  totalMonthly: 33.97,
  totalAnnual: 407.64,
  activeCount: 3,
  forgottenCount: 2,
  potentialSavings: 287.76,
};

describe('SubscriptionInsightCard', () => {
  beforeEach(() => {
    clearInvokeMocks();
  });

  it('renders subscription analysis header', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText('Subscription Analysis')).toBeInTheDocument();
  });

  it('shows total monthly and annual costs', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText(/\$33\.97\/month/)).toBeInTheDocument();
    expect(screen.getByText(/\$407\.64\/year/)).toBeInTheDocument();
  });

  it('shows forgotten count', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText(/2 potentially forgotten/)).toBeInTheDocument();
  });

  it('renders forgotten merchant names', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText('Netflix')).toBeInTheDocument();
    expect(screen.getByText('Hulu')).toBeInTheDocument();
  });

  it('shows potential savings', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText(/\$287\.76\/year/)).toBeInTheDocument();
  });

  it('Cancel button calls update_subscription_status with cancelled', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({});
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    const cancelBtns = screen.getAllByText('Cancel');
    await user.click(cancelBtns[0]!);
    expect(invoke).toHaveBeenCalledWith('update_subscription_status', { chargeId: '1', status: 'cancelled' });
  });

  it('Keep button calls update_subscription_status with user_confirmed', async () => {
    const user = userEvent.setup();
    invoke.mockResolvedValue({});
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    const keepBtns = screen.getAllByText('Keep');
    await user.click(keepBtns[0]!);
    expect(invoke).toHaveBeenCalledWith('update_subscription_status', { chargeId: '1', status: 'user_confirmed' });
  });

  it('Dismiss button fires onDismiss callback', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={onDismiss} />);
    await user.click(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('shows view-all link when there are non-forgotten charges', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText(/View all 3 subscriptions/)).toBeInTheDocument();
  });

  it('expands to show all subscriptions', async () => {
    const user = userEvent.setup();
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    await user.click(screen.getByText(/View all 3 subscriptions/));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText('Collapse')).toBeInTheDocument();
  });

  it('shows active count in header', () => {
    render(<SubscriptionInsightCard charges={allCharges} summary={summary} onDismiss={() => {}} />);
    expect(screen.getByText(/3 recurring charges/)).toBeInTheDocument();
  });
});

// Need vi import for vi.fn()
import { vi } from 'vitest';
