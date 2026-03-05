import type { FinancialOverview } from './FinancialDashboard.types';

interface SpendingOverviewSectionProps {
  overview: FinancialOverview;
}

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function getTrendInfo(overview: FinancialOverview): { label: string; modifier: string; arrow: string } | null {
  if (overview.previousPeriodSpending === null) return null;

  const diff = overview.totalSpending - overview.previousPeriodSpending;
  const pct = overview.previousPeriodSpending > 0
    ? Math.round((Math.abs(diff) / overview.previousPeriodSpending) * 100)
    : 0;

  if (diff < 0) {
    return { label: `${pct}% less than last period`, modifier: 'fin-dash__trend--down', arrow: '\u2193' };
  }
  if (diff > 0) {
    return { label: `${pct}% more than last period`, modifier: 'fin-dash__trend--up', arrow: '\u2191' };
  }
  return { label: 'Same as last period', modifier: 'fin-dash__trend--stable', arrow: '\u2194' };
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
    <div className="fin-dash__section">
      <h3 className="fin-dash__section-title">Overview</h3>

      <div className="fin-dash__stats">
        <div className="fin-dash__stat">
          <span
            className="fin-dash__stat-value"
            aria-label={`Total spending: ${formatCurrency(overview.totalSpending)}`}
          >
            {formatCurrency(overview.totalSpending)}
          </span>
          <span className="fin-dash__stat-label">Total Spent</span>
        </div>

        <div className="fin-dash__stat">
          <span className="fin-dash__stat-value">
            {formatCurrency(dailyAvg)}
          </span>
          <span className="fin-dash__stat-label">Daily Average</span>
        </div>

        <div className="fin-dash__stat">
          <span className="fin-dash__stat-value">{overview.transactionCount}</span>
          <span className="fin-dash__stat-label">Transactions</span>
        </div>

        {trend && (
          <div className="fin-dash__stat">
            <span className={`fin-dash__trend ${trend.modifier}`}>
              {trend.arrow} {trend.label}
            </span>
          </div>
        )}
      </div>

      <span className="fin-dash__meta">
        {overview.periodStart} &mdash; {overview.periodEnd}
      </span>
    </div>
  );
}
