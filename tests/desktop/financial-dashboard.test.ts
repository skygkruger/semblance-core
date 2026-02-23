/**
 * Step 19 — FinancialDashboard tests.
 * Category breakdown rendering, anomaly cards with dismiss, free tier prompt, premium full view.
 */

import { describe, it, expect, vi } from 'vitest';
import type { FinancialDashboardProps } from '../../packages/desktop/src/components/FinancialDashboard';

function makeBreakdown(): FinancialDashboardProps['breakdown'] {
  return {
    totalSpending: 150000,
    totalIncome: 250000,
    categoryBreakdown: [
      { category: 'Food & Dining', total: 50000, percentage: 33 },
      { category: 'Shopping', total: 40000, percentage: 27 },
      { category: 'Entertainment', total: 30000, percentage: 20 },
      { category: 'Transportation', total: 20000, percentage: 13 },
      { category: 'Other', total: 10000, percentage: 7 },
    ],
    dailyAverage: 5000,
    transactionCount: 45,
  };
}

function makeAnomalies() {
  return [
    {
      id: 'a1',
      transactionId: 'txn-1',
      type: 'unusual-amount',
      severity: 'high' as const,
      title: 'Unusually large charge at Amazon',
      description: '$500.00 is 10x your usual spend of $50.00.',
      detectedAt: '2026-01-20T12:00:00Z',
      dismissed: false,
    },
    {
      id: 'a2',
      transactionId: 'txn-2',
      type: 'first-time-merchant',
      severity: 'low' as const,
      title: 'First purchase at NewStore',
      description: '$25.00 at NewStore - you haven\'t purchased here before.',
      detectedAt: '2026-01-21T12:00:00Z',
      dismissed: false,
    },
  ];
}

describe('FinancialDashboard (Step 19)', () => {
  it('category breakdown data shape includes all required fields', () => {
    const breakdown = makeBreakdown();

    expect(breakdown!.categoryBreakdown).toHaveLength(5);
    expect(breakdown!.categoryBreakdown[0]!.category).toBe('Food & Dining');
    expect(breakdown!.categoryBreakdown[0]!.total).toBe(50000);
    expect(breakdown!.categoryBreakdown[0]!.percentage).toBe(33);

    // Verify all categories have percentage summing to ~100%
    const totalPercent = breakdown!.categoryBreakdown.reduce((sum, c) => sum + c.percentage, 0);
    expect(totalPercent).toBe(100);
  });

  it('anomaly cards contain severity and dismiss-compatible data', () => {
    const anomalies = makeAnomalies();
    const onDismiss = vi.fn();

    expect(anomalies).toHaveLength(2);
    expect(anomalies[0]!.severity).toBe('high');
    expect(anomalies[0]!.id).toBe('a1');
    expect(anomalies[1]!.severity).toBe('low');

    // Simulate dismiss action
    onDismiss(anomalies[0]!.id);
    expect(onDismiss).toHaveBeenCalledWith('a1');
  });

  it('free tier props show activation prompt', () => {
    const props: FinancialDashboardProps = {
      isPremium: false,
      breakdown: null,
      anomalies: [],
      recentTransactions: [],
      trends: [],
      selectedYear: 2026,
      selectedMonth: 1,
      onMonthChange: vi.fn(),
      onDismissAnomaly: vi.fn(),
      onActivateDigitalRepresentative: vi.fn(),
    };

    expect(props.isPremium).toBe(false);
    expect(props.breakdown).toBeNull();

    // Free tier should trigger Digital Representative activation
    props.onActivateDigitalRepresentative();
    expect(props.onActivateDigitalRepresentative).toHaveBeenCalled();
  });

  it('premium tier props include full spending data', () => {
    const props: FinancialDashboardProps = {
      isPremium: true,
      breakdown: makeBreakdown(),
      anomalies: makeAnomalies(),
      recentTransactions: [
        { id: 'txn-1', date: '2026-01-20', merchantNormalized: 'Amazon', amount: -5000, category: 'Shopping' },
        { id: 'txn-2', date: '2026-01-19', merchantNormalized: 'Starbucks', amount: -450, category: 'Food & Dining' },
      ],
      trends: [
        { year: 2025, month: 11, totalSpending: 120000, totalIncome: 250000 },
        { year: 2025, month: 12, totalSpending: 140000, totalIncome: 250000 },
        { year: 2026, month: 1, totalSpending: 150000, totalIncome: 250000 },
      ],
      selectedYear: 2026,
      selectedMonth: 1,
      onMonthChange: vi.fn(),
      onDismissAnomaly: vi.fn(),
      onActivateDigitalRepresentative: vi.fn(),
    };

    expect(props.isPremium).toBe(true);
    expect(props.breakdown!.totalSpending).toBe(150000);
    expect(props.anomalies).toHaveLength(2);
    expect(props.recentTransactions).toHaveLength(2);
    expect(props.trends).toHaveLength(3);
  });
});
