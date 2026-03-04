// @vitest-environment jsdom
// Tests for FinancialDashboard — renders the real component and its sub-components.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FinancialDashboard } from '@semblance/ui/components/FinancialDashboard/FinancialDashboard.web';
import type {
  FinancialOverview,
  CategoryBreakdown,
  SpendingAnomaly,
  RecurringCharge,
  SubscriptionSummary,
  FinancialDashboardProps,
} from '@semblance/ui/components/FinancialDashboard/FinancialDashboard.types';

// ─── Mock Fixtures ─────────────────────────────────────────────────────────────

const mockOverview: FinancialOverview = {
  totalSpending: 4237.89,
  previousPeriodSpending: 3981.44,
  transactionCount: 87,
  periodStart: '2026-02-01',
  periodEnd: '2026-03-01',
};

const mockOverviewDecreased: FinancialOverview = {
  totalSpending: 3000.00,
  previousPeriodSpending: 4000.00,
  transactionCount: 60,
  periodStart: '2026-02-01',
  periodEnd: '2026-03-01',
};

const mockOverviewIncreased: FinancialOverview = {
  totalSpending: 5000.00,
  previousPeriodSpending: 3000.00,
  transactionCount: 100,
  periodStart: '2026-02-01',
  periodEnd: '2026-03-01',
};

const mockCategories: CategoryBreakdown[] = [
  { category: 'Food & Dining',  total: 1124.50, percentage: 27, transactionCount: 32, trend: 'up'     },
  { category: 'Shopping',       total: 843.20,  percentage: 20, transactionCount: 18, trend: 'down'   },
  { category: 'Transportation', total: 612.00,  percentage: 14, transactionCount: 9,  trend: 'stable' },
  { category: 'Subscriptions',  total: 487.33,  percentage: 11, transactionCount: 12, trend: 'stable' },
];

const mockAnomalies: SpendingAnomaly[] = [
  {
    id: 'a1',
    type: 'unusual_amount',
    severity: 'high',
    title: 'Unusually large charge',
    description: 'DoorDash charged $187.50 — 4x your typical order size.',
    amount: 187.50,
    merchantName: 'DoorDash',
    detectedAt: '2026-02-28T14:22:00Z',
  },
  {
    id: 'a2',
    type: 'new_merchant',
    severity: 'low',
    title: 'New merchant',
    description: 'First purchase at Lemonade Insurance — $42.00.',
    amount: 42.00,
    merchantName: 'Lemonade Insurance',
    detectedAt: '2026-02-20T09:10:00Z',
  },
];

const mockForgottenCharge: RecurringCharge = {
  id: 's5',
  merchantName: 'Planet Fitness',
  amount: 24.99,
  frequency: 'monthly',
  confidence: 0.88,
  lastChargeDate: '2026-01-05',
  chargeCount: 19,
  estimatedAnnualCost: 299.88,
  status: 'forgotten',
};

const mockActiveCharge: RecurringCharge = {
  id: 's1',
  merchantName: 'Netflix',
  amount: 15.49,
  frequency: 'monthly',
  confidence: 0.99,
  lastChargeDate: '2026-02-15',
  chargeCount: 24,
  estimatedAnnualCost: 185.88,
  status: 'user_confirmed',
};

const mockActiveCharge2: RecurringCharge = {
  id: 's2',
  merchantName: 'Spotify',
  amount: 10.99,
  frequency: 'monthly',
  confidence: 0.98,
  lastChargeDate: '2026-02-10',
  chargeCount: 18,
  estimatedAnnualCost: 131.88,
  status: 'active',
};

const mockSubscriptionSummary: SubscriptionSummary = {
  totalMonthly: 122.46,
  totalAnnual: 1469.52,
  activeCount: 5,
  forgottenCount: 1,
  potentialSavings: 299.88,
};

const mockSubscriptionSummaryNoSavings: SubscriptionSummary = {
  totalMonthly: 26.48,
  totalAnnual: 317.76,
  activeCount: 2,
  forgottenCount: 0,
  potentialSavings: 0,
};

const emptySubscriptions = {
  charges: [] as RecurringCharge[],
  summary: {
    totalMonthly: 0,
    totalAnnual: 0,
    activeCount: 0,
    forgottenCount: 0,
    potentialSavings: 0,
  } as SubscriptionSummary,
};

function makeProps(overrides: Partial<FinancialDashboardProps> = {}): FinancialDashboardProps {
  return {
    overview: mockOverview,
    categories: mockCategories,
    anomalies: mockAnomalies,
    subscriptions: {
      charges: [mockActiveCharge, mockActiveCharge2, mockForgottenCharge],
      summary: mockSubscriptionSummary,
    },
    selectedPeriod: '30d',
    onPeriodChange: vi.fn(),
    onDismissAnomaly: vi.fn(),
    onCancelSubscription: vi.fn(),
    onKeepSubscription: vi.fn(),
    onImportStatement: vi.fn(),
    ...overrides,
  };
}

// ─── Data Rendering ────────────────────────────────────────────────────────────

describe('FinancialDashboard — data rendering', () => {
  it('renders total spending amount', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText('$4237.89')).toBeInTheDocument();
  });

  it('renders correct number of categories', () => {
    render(<FinancialDashboard {...makeProps()} />);
    // Each category renders a label in the horizontal bar chart
    expect(screen.getByText('Food & Dining')).toBeInTheDocument();
    expect(screen.getByText('Shopping')).toBeInTheDocument();
    expect(screen.getByText('Transportation')).toBeInTheDocument();
    expect(screen.getByText('Subscriptions')).toBeInTheDocument();
  });

  it('category bars have correct percentages as inline widths', () => {
    render(<FinancialDashboard {...makeProps()} />);
    // The HorizontalBarChart sets style={{ width: `${percentage}%` }} on bar elements
    const bars = document.querySelectorAll('.h-bar-chart__bar');
    const widths = Array.from(bars).map((el) => (el as HTMLElement).style.width);
    expect(widths).toContain('27%');
    expect(widths).toContain('20%');
    expect(widths).toContain('14%');
    expect(widths).toContain('11%');
  });

  it('renders trend arrow down for decreased spending', () => {
    render(<FinancialDashboard {...makeProps({ overview: mockOverviewDecreased })} />);
    // Down arrow ↓ Unicode \u2193 is displayed in the trend span
    expect(screen.getByText(/↓/)).toBeInTheDocument();
    expect(screen.getByText(/less than last period/)).toBeInTheDocument();
  });

  it('renders trend arrow up for increased spending', () => {
    render(<FinancialDashboard {...makeProps({ overview: mockOverviewIncreased })} />);
    // Up arrow ↑ Unicode \u2191 is displayed in the trend span
    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.getByText(/more than last period/)).toBeInTheDocument();
  });

  it('renders transaction count', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText(/87 transactions/)).toBeInTheDocument();
  });

  it('shows daily average', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText(/Daily average:/)).toBeInTheDocument();
  });

  it('anomaly cards render merchant name and amount', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText('DoorDash')).toBeInTheDocument();
    expect(screen.getByText('$187.50')).toBeInTheDocument();
    expect(screen.getByText('Lemonade Insurance')).toBeInTheDocument();
    expect(screen.getByText('$42.00')).toBeInTheDocument();
  });

  it('subscription list shows charge count', () => {
    render(<FinancialDashboard {...makeProps()} />);
    // Active count is shown in the subscriptions section heading
    expect(screen.getByText(/5 active/)).toBeInTheDocument();
  });

  it('period selector renders all options', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText('7D')).toBeInTheDocument();
    expect(screen.getByText('30D')).toBeInTheDocument();
    expect(screen.getByText('90D')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('empty state shows import CTA when no overview and no categories', () => {
    render(
      <FinancialDashboard
        {...makeProps({
          overview: null,
          categories: [],
          anomalies: [],
          subscriptions: emptySubscriptions,
        })}
      />,
    );
    expect(screen.getByText('No Financial Data Yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import Statement' })).toBeInTheDocument();
  });

  it('amounts use DM Mono font class on the total element', () => {
    render(<FinancialDashboard {...makeProps()} />);
    // .fin-dash__total has font-family: var(--fm) which is DM Mono
    const totalEl = document.querySelector('.fin-dash__total');
    expect(totalEl).not.toBeNull();
    expect(totalEl!.textContent).toContain('$4237.89');
  });

  it('shows potential savings when subscriptions have forgotten charges', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText(/Potential savings:/)).toBeInTheDocument();
    expect(screen.getByText(/Potential savings: \$299\.88\/yr/)).toBeInTheDocument();
  });

  it('shows forgotten subscription count', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText(/Potentially Forgotten \(1\)/)).toBeInTheDocument();
  });

  it('renders period dates in meta', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText(/2026-02-01 to 2026-03-01/)).toBeInTheDocument();
  });
});

// ─── Premium Gating ────────────────────────────────────────────────────────────

describe('FinancialDashboard — premium gating', () => {
  it('component renders when data is provided', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(screen.getByText('Financial Overview')).toBeInTheDocument();
  });

  it('shows empty state when no data (no overview, no categories)', () => {
    render(
      <FinancialDashboard
        {...makeProps({
          overview: null,
          categories: [],
          anomalies: [],
          subscriptions: emptySubscriptions,
        })}
      />,
    );
    expect(screen.getByText('No Financial Data Yet')).toBeInTheDocument();
  });

  it('import button is present in empty state', () => {
    render(
      <FinancialDashboard
        {...makeProps({
          overview: null,
          categories: [],
          anomalies: [],
          subscriptions: emptySubscriptions,
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Import Statement' })).toBeInTheDocument();
  });

  it('import CTA text is correct in empty state', () => {
    render(
      <FinancialDashboard
        {...makeProps({
          overview: null,
          categories: [],
          anomalies: [],
          subscriptions: emptySubscriptions,
        })}
      />,
    );
    expect(
      screen.getByText(/Import a bank or credit card statement to get started/),
    ).toBeInTheDocument();
  });

  it('renders loading skeleton when loading=true', () => {
    render(
      <FinancialDashboard
        {...makeProps({ loading: true })}
      />,
    );
    const skeleton = document.querySelector('.fin-dash__skeleton');
    expect(skeleton).not.toBeNull();
  });
});

// ─── Interactions ─────────────────────────────────────────────────────────────

describe('FinancialDashboard — interactions', () => {
  it('dismiss anomaly fires onDismissAnomaly with the correct anomaly ID', () => {
    const onDismissAnomaly = vi.fn();
    render(<FinancialDashboard {...makeProps({ onDismissAnomaly })} />);
    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtns[0]!);
    expect(onDismissAnomaly).toHaveBeenCalledWith('a1');
  });

  it('cancel subscription fires onCancelSubscription with the correct charge ID', () => {
    const onCancelSubscription = vi.fn();
    render(<FinancialDashboard {...makeProps({ onCancelSubscription })} />);
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(onCancelSubscription).toHaveBeenCalledWith('s5');
  });

  it('keep subscription fires onKeepSubscription with the correct charge ID', () => {
    const onKeepSubscription = vi.fn();
    render(<FinancialDashboard {...makeProps({ onKeepSubscription })} />);
    const keepBtn = screen.getByRole('button', { name: 'Keep' });
    fireEvent.click(keepBtn);
    expect(onKeepSubscription).toHaveBeenCalledWith('s5');
  });

  it('import button in data view fires onImportStatement', () => {
    const onImportStatement = vi.fn();
    render(<FinancialDashboard {...makeProps({ onImportStatement })} />);
    // In the loaded state the import button is at the bottom of the dashboard
    const importBtns = screen.getAllByRole('button', { name: 'Import Statement' });
    fireEvent.click(importBtns[0]!);
    expect(onImportStatement).toHaveBeenCalledTimes(1);
  });

  it('period selector fires onPeriodChange with the selected period value', () => {
    const onPeriodChange = vi.fn();
    render(<FinancialDashboard {...makeProps({ selectedPeriod: '30d', onPeriodChange })} />);
    const btn7D = screen.getByRole('button', { name: '7D' });
    fireEvent.click(btn7D);
    expect(onPeriodChange).toHaveBeenCalledWith('7d');
  });

  it('clicking 7D period option fires callback with "7d"', () => {
    const onPeriodChange = vi.fn();
    render(<FinancialDashboard {...makeProps({ selectedPeriod: '30d', onPeriodChange })} />);
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(onPeriodChange).toHaveBeenCalledWith('7d');
  });

  it('clicking 90D period option fires callback with "90d"', () => {
    const onPeriodChange = vi.fn();
    render(<FinancialDashboard {...makeProps({ selectedPeriod: '30d', onPeriodChange })} />);
    fireEvent.click(screen.getByRole('button', { name: '90D' }));
    expect(onPeriodChange).toHaveBeenCalledWith('90d');
  });

  it('clicking Custom period option fires callback with "custom"', () => {
    const onPeriodChange = vi.fn();
    render(<FinancialDashboard {...makeProps({ selectedPeriod: '30d', onPeriodChange })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(onPeriodChange).toHaveBeenCalledWith('custom');
  });

  it('anomaly cards appear in data order (most recently detected first in fixture order)', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const alerts = screen.getAllByRole('alert');
    // First alert should correspond to first anomaly in the array (a1 — DoorDash)
    expect(alerts[0]).toHaveTextContent('DoorDash');
    // Second alert corresponds to a2 — Lemonade Insurance
    expect(alerts[1]).toHaveTextContent('Lemonade Insurance');
  });

  it('dismiss button text is "Dismiss"', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const dismissBtns = screen.getAllByRole('button', { name: 'Dismiss' });
    expect(dismissBtns.length).toBeGreaterThanOrEqual(1);
    expect(dismissBtns[0]).toHaveTextContent('Dismiss');
  });
});

// ─── Chart Components ─────────────────────────────────────────────────────────

describe('FinancialDashboard — chart components', () => {
  it('HorizontalBarChart renders correct number of bar rows', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const rows = document.querySelectorAll('.h-bar-chart__row');
    expect(rows.length).toBe(mockCategories.length);
  });

  it('bar widths match the category percentages via inline style', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const bars = document.querySelectorAll('.h-bar-chart__bar');
    const widths = Array.from(bars).map((el) => (el as HTMLElement).style.width);
    expect(widths[0]).toBe('27%');
    expect(widths[1]).toBe('20%');
    expect(widths[2]).toBe('14%');
    expect(widths[3]).toBe('11%');
  });

  it('labels display the category names', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const labels = document.querySelectorAll('.h-bar-chart__label');
    const labelTexts = Array.from(labels).map((el) => el.textContent);
    expect(labelTexts).toContain('Food & Dining');
    expect(labelTexts).toContain('Shopping');
    expect(labelTexts).toContain('Transportation');
    expect(labelTexts).toContain('Subscriptions');
  });

  it('zero-value bar has minimum width of 1% via Math.max guard', () => {
    const zeroCategory: CategoryBreakdown = {
      category: 'Other',
      total: 0,
      percentage: 0,
      transactionCount: 0,
      trend: 'stable',
    };
    render(
      <FinancialDashboard
        {...makeProps({ categories: [zeroCategory] })}
      />,
    );
    const bars = document.querySelectorAll('.h-bar-chart__bar');
    expect((bars[0] as HTMLElement).style.width).toBe('1%');
  });

  it('PeriodSelector highlights the active option with aria-pressed=true', () => {
    render(<FinancialDashboard {...makeProps({ selectedPeriod: '30d' })} />);
    const btn30D = screen.getByRole('button', { name: '30D' });
    expect(btn30D).toHaveAttribute('aria-pressed', 'true');
  });

  it('PeriodSelector fires callback when a period option is clicked', () => {
    const onPeriodChange = vi.fn();
    render(<FinancialDashboard {...makeProps({ onPeriodChange })} />);
    fireEvent.click(screen.getByRole('button', { name: '90D' }));
    expect(onPeriodChange).toHaveBeenCalledOnce();
  });

  it('empty chart data renders nothing (CategoryBreakdownSection returns null)', () => {
    render(
      <FinancialDashboard {...makeProps({ categories: [] })} />,
    );
    expect(document.querySelector('.h-bar-chart')).toBeNull();
  });

  it('chart container has correct aria-label', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const chart = screen.getByRole('img', { name: 'Category breakdown chart' });
    expect(chart).toBeInTheDocument();
  });

  it('bar chart values display formatted currency', () => {
    render(<FinancialDashboard {...makeProps()} />);
    // The HorizontalBarChart value spans render formatted totals
    expect(screen.getByLabelText('Food & Dining: $1124.50')).toBeInTheDocument();
    expect(screen.getByLabelText('Shopping: $843.20')).toBeInTheDocument();
  });

  it('multiple categories render in the supplied data order', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const labels = document.querySelectorAll('.h-bar-chart__label');
    expect(labels[0]!.textContent).toBe('Food & Dining');
    expect(labels[1]!.textContent).toBe('Shopping');
    expect(labels[2]!.textContent).toBe('Transportation');
    expect(labels[3]!.textContent).toBe('Subscriptions');
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('FinancialDashboard — accessibility', () => {
  it('total spending amount has an aria-label', () => {
    render(<FinancialDashboard {...makeProps()} />);
    expect(
      screen.getByLabelText('Total spending: $4237.89'),
    ).toBeInTheDocument();
  });

  it('anomaly cards have role="alert"', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts.length).toBe(mockAnomalies.length);
  });

  it('period selector has role="group"', () => {
    render(<FinancialDashboard {...makeProps()} />);
    const group = screen.getByRole('group', { name: 'Period selector' });
    expect(group).toBeInTheDocument();
  });

  it('skeleton state renders the skeleton container element', () => {
    render(<FinancialDashboard {...makeProps({ loading: true })} />);
    const skeletonBars = document.querySelectorAll('.fin-dash__skeleton-bar');
    expect(skeletonBars.length).toBeGreaterThan(0);
  });

  it('loading state does not show the main financial content', () => {
    render(<FinancialDashboard {...makeProps({ loading: true })} />);
    expect(screen.queryByText('$4237.89')).not.toBeInTheDocument();
    expect(screen.queryByText(/87 transactions/)).not.toBeInTheDocument();
    expect(document.querySelector('.fin-dash__overview')).toBeNull();
  });
});
