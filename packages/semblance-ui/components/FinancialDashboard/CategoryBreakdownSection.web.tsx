import { HorizontalBarChart } from '../Charts/HorizontalBarChart.web';
import type { CategoryBreakdown } from './FinancialDashboard.types';

interface CategoryBreakdownSectionProps {
  categories: CategoryBreakdown[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Housing': '#6ECFA3',
  'Transportation': '#C9A85C',
  'Food & Dining': '#C97B6E',
  'Shopping': '#8593A4',
  'Entertainment': '#A8B4C0',
  'Health': '#6ECFA3',
  'Personal': '#C9A85C',
  'Financial': '#5E6B7C',
  'Subscriptions': '#CDD4DB',
  'Income': '#6ECFA3',
  'Other': '#5E6B7C',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? '#8593A4';
}

function formatCurrency(v: number): string {
  return `$${Math.abs(v).toFixed(2)}`;
}

export function CategoryBreakdownSection({ categories }: CategoryBreakdownSectionProps) {
  if (categories.length === 0) return null;

  const chartData = categories.map((c) => ({
    label: c.category,
    value: c.total,
    percentage: c.percentage,
    color: getCategoryColor(c.category),
  }));

  return (
    <div className="fin-dash__section">
      <h3 className="fin-dash__section-title">Spending by Category</h3>
      <HorizontalBarChart data={chartData} formatValue={formatCurrency} />
    </div>
  );
}
