/**
 * Financial Dashboard — Full financial overview with spending breakdown,
 * anomaly alerts, and transaction history.
 *
 * Free tier: subscription list + "Activate your Digital Representative" prompt.
 * Premium tier: month selector, spending/income totals, SVG donut chart,
 * trend line, anomaly cards with dismiss, recent transactions.
 */

import { useState } from 'react';

// ─── Types (matching SpendingAnalyzer output) ─────────────────────────────

interface CategorySpending {
  category: string;
  total: number;
  percentage: number;
}

interface MonthlyBreakdown {
  totalSpending: number;
  totalIncome: number;
  categoryBreakdown: CategorySpending[];
  dailyAverage: number;
  transactionCount: number;
}

interface Anomaly {
  id: string;
  transactionId: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  detectedAt: string;
  dismissed: boolean;
}

interface TransactionSummary {
  id: string;
  date: string;
  merchantNormalized: string;
  amount: number;
  category: string;
}

interface SpendingTrend {
  year: number;
  month: number;
  totalSpending: number;
  totalIncome: number;
}

export interface FinancialDashboardProps {
  isPremium: boolean;
  breakdown: MonthlyBreakdown | null;
  anomalies: Anomaly[];
  recentTransactions: TransactionSummary[];
  trends: SpendingTrend[];
  selectedYear: number;
  selectedMonth: number;
  onMonthChange: (year: number, month: number) => void;
  onDismissAnomaly: (id: string) => void;
  onActivateDigitalRepresentative: () => void;
}

// ─── Category colors ──────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'Housing': '#7eb8da',
  'Transportation': '#f27a93',
  'Food & Dining': '#7ec9a0',
  'Shopping': '#d4a76a',
  'Entertainment': '#b8a5d6',
  'Health': '#f5d6c6',
  'Personal': '#f5f0e1',
  'Financial': '#6e6a86',
  'Subscriptions': '#e8e3e3',
  'Income': '#7ec9a0',
  'Other': '#9e9e9e',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#9e9e9e';
}

// ─── SVG Donut Chart ──────────────────────────────────────────────────────

function DonutChart({ categories }: { categories: CategorySpending[] }) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 80;
  const innerRadius = 50;

  let cumulativePercent = 0;
  const segments = categories.filter(c => c.percentage > 0).map(cat => {
    const startAngle = cumulativePercent * 3.6 * (Math.PI / 180);
    cumulativePercent += cat.percentage;
    const endAngle = cumulativePercent * 3.6 * (Math.PI / 180);

    const x1Outer = cx + outerRadius * Math.sin(startAngle);
    const y1Outer = cy - outerRadius * Math.cos(startAngle);
    const x2Outer = cx + outerRadius * Math.sin(endAngle);
    const y2Outer = cy - outerRadius * Math.cos(endAngle);
    const x1Inner = cx + innerRadius * Math.sin(endAngle);
    const y1Inner = cy - innerRadius * Math.cos(endAngle);
    const x2Inner = cx + innerRadius * Math.sin(startAngle);
    const y2Inner = cy - innerRadius * Math.cos(startAngle);

    const largeArc = cat.percentage > 50 ? 1 : 0;

    const d = [
      `M ${x1Outer} ${y1Outer}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
      `L ${x1Inner} ${y1Inner}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
      'Z',
    ].join(' ');

    return { d, color: getCategoryColor(cat.category), category: cat.category };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Spending breakdown by category">
      {segments.map((seg, i) => (
        <path key={i} d={seg.d} fill={seg.color} stroke="#1a1a2e" strokeWidth="1">
          <title>{seg.category}</title>
        </path>
      ))}
    </svg>
  );
}

// ─── SVG Trend Line ───────────────────────────────────────────────────────

function TrendLine({ trends }: { trends: SpendingTrend[] }) {
  if (trends.length < 2) return null;

  const width = 400;
  const height = 120;
  const padding = 20;
  const maxSpending = Math.max(...trends.map(t => t.totalSpending), 1);

  const points = trends.map((t, i) => {
    const x = padding + (i / (trends.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((t.totalSpending / maxSpending) * (height - 2 * padding));
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Spending trend">
      <polyline
        points={points}
        fill="none"
        stroke="#7eb8da"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {trends.map((t, i) => {
        const x = padding + (i / (trends.length - 1)) * (width - 2 * padding);
        const y = height - padding - ((t.totalSpending / maxSpending) * (height - 2 * padding));
        return <circle key={i} cx={x} cy={y} r="3" fill="#7eb8da" />;
      })}
    </svg>
  );
}

// ─── Month Selector ───────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MonthSelector({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const prev = () => {
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    onChange(y, m);
  };
  const next = () => {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    onChange(y, m);
  };

  return (
    <div className="flex items-center gap-4" data-testid="month-selector">
      <button onClick={prev} aria-label="Previous month">&lt;</button>
      <span className="font-mono text-sm">{MONTH_NAMES[month - 1]} {year}</span>
      <button onClick={next} aria-label="Next month">&gt;</button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────

export function FinancialDashboard(props: FinancialDashboardProps) {
  const {
    isPremium,
    breakdown,
    anomalies,
    recentTransactions,
    trends,
    selectedYear,
    selectedMonth,
    onMonthChange,
    onDismissAnomaly,
    onActivateDigitalRepresentative,
  } = props;

  // Free tier view
  if (!isPremium) {
    return (
      <div className="p-6 space-y-6" data-testid="financial-dashboard-free">
        <h2 className="text-lg font-semibold">Financial Overview</h2>
        <div className="border border-muted rounded-lg p-6 text-center space-y-4">
          <p className="text-muted">Unlock full financial intelligence with your Digital Representative.</p>
          <p className="text-sm text-muted">
            Transaction categorization, spending insights, anomaly detection, and bank integration.
          </p>
          <button
            className="px-4 py-2 bg-accent text-bg rounded font-mono text-sm"
            onClick={onActivateDigitalRepresentative}
            data-testid="activate-digital-representative"
          >
            Activate your Digital Representative
          </button>
        </div>
      </div>
    );
  }

  // Premium view
  return (
    <div className="p-6 space-y-6" data-testid="financial-dashboard-premium">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Financial Dashboard</h2>
        <MonthSelector year={selectedYear} month={selectedMonth} onChange={onMonthChange} />
      </div>

      {/* Summary Totals */}
      {breakdown && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-muted rounded-lg p-4">
            <p className="text-sm text-muted">Total Spending</p>
            <p className="text-xl font-mono" data-testid="total-spending">
              ${(breakdown.totalSpending / 100).toFixed(2)}
            </p>
          </div>
          <div className="border border-muted rounded-lg p-4">
            <p className="text-sm text-muted">Total Income</p>
            <p className="text-xl font-mono" data-testid="total-income">
              ${(breakdown.totalIncome / 100).toFixed(2)}
            </p>
          </div>
          <div className="border border-muted rounded-lg p-4">
            <p className="text-sm text-muted">Transactions</p>
            <p className="text-xl font-mono">{breakdown.transactionCount}</p>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {breakdown && breakdown.categoryBreakdown.length > 0 && (
        <div className="border border-muted rounded-lg p-4" data-testid="category-breakdown">
          <h3 className="text-sm font-semibold mb-4">Spending by Category</h3>
          <div className="flex gap-6 items-start">
            <DonutChart categories={breakdown.categoryBreakdown} />
            <div className="space-y-2 flex-1">
              {breakdown.categoryBreakdown.map(cat => (
                <div key={cat.category} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: getCategoryColor(cat.category) }}
                  />
                  <span className="flex-1">{cat.category}</span>
                  <span className="font-mono">${(cat.total / 100).toFixed(2)}</span>
                  <span className="text-muted w-12 text-right">{cat.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Spending Trend */}
      {trends.length > 1 && (
        <div className="border border-muted rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-4">Spending Trend</h3>
          <TrendLine trends={trends} />
        </div>
      )}

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="space-y-2" data-testid="anomaly-alerts">
          <h3 className="text-sm font-semibold">Anomaly Alerts</h3>
          {anomalies.map(anomaly => (
            <div
              key={anomaly.id}
              className={`border rounded-lg p-3 flex items-start gap-3 ${
                anomaly.severity === 'high' ? 'border-red-400' :
                anomaly.severity === 'medium' ? 'border-yellow-400' : 'border-muted'
              }`}
              data-testid={`anomaly-card-${anomaly.id}`}
            >
              <div className="flex-1">
                <p className="text-sm font-semibold">{anomaly.title}</p>
                <p className="text-xs text-muted">{anomaly.description}</p>
              </div>
              <button
                className="text-xs text-muted hover:text-text"
                onClick={() => onDismissAnomaly(anomaly.id)}
                data-testid={`dismiss-anomaly-${anomaly.id}`}
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div data-testid="recent-transactions">
          <h3 className="text-sm font-semibold mb-2">Recent Transactions</h3>
          <div className="space-y-1">
            {recentTransactions.map(txn => (
              <div key={txn.id} className="flex items-center gap-2 text-sm border-b border-muted/30 py-1">
                <span className="text-muted w-20 font-mono text-xs">{txn.date}</span>
                <span className="flex-1">{txn.merchantNormalized}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-sm"
                  style={{ backgroundColor: getCategoryColor(txn.category) + '30', color: getCategoryColor(txn.category) }}
                >
                  {txn.category}
                </span>
                <span className={`font-mono w-24 text-right ${txn.amount >= 0 ? 'text-green-500' : ''}`}>
                  {txn.amount >= 0 ? '+' : ''}${(txn.amount / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
