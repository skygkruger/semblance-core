import type { FinancialOverview } from './FinancialDashboard.types';

interface SpendingOverviewSectionProps {
  overview: FinancialOverview;
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function getTrendInfo(overview: FinancialOverview): { label: string; className: string } {
  if (overview.previousPeriodSpending === null) {
    return { label: '', className: '' };
  }
  const diff = overview.totalSpending - overview.previousPeriodSpending;
  const pct = overview.previousPeriodSpending > 0
    ? Math.round((Math.abs(diff) / overview.previousPeriodSpending) * 100)
    : 0;

  if (diff < 0) {
    return { label: `${pct}% less than last period`, className: 'fin-dash__trend--down' };
  }
  if (diff > 0) {
    return { label: `${pct}% more than last period`, className: 'fin-dash__trend--up' };
  }
  return { label: 'Same as last period', className: 'fin-dash__trend--stable' };
}

export function SpendingOverviewSection({ overview }: SpendingOverviewSectionProps) {
  const trend = getTrendInfo(overview);
  const days = Math.max(
    1,
    Math.ceil(
      (new Date(overview.periodEnd).getTime() - new Date(overview.periodStart).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const dailyAvg = overview.totalSpending / days;

  return (
    <div className="fin-dash__overview">
      <div className="fin-dash__overview-row">
        <span className="fin-dash__total" aria-label={`Total spending: ${formatCurrency(overview.totalSpending)}`}>
          {formatCurrency(overview.totalSpending)}
        </span>
        {trend.label && (
          <span className={`fin-dash__trend ${trend.className}`}>
            {trend.className.includes('down') ? '\u2193' : trend.className.includes('up') ? '\u2191' : '\u2194'}{' '}
            {trend.label}
          </span>
        )}
      </div>
      <span className="fin-dash__meta">
        {overview.transactionCount} transaction{overview.transactionCount !== 1 ? 's' : ''}{' '}
        &middot; {overview.periodStart} to {overview.periodEnd}
      </span>
      <span className="fin-dash__daily-avg">
        Daily average: {formatCurrency(dailyAvg)}
      </span>
    </div>
  );
}
