import { HorizontalBarChart } from '../Charts/HorizontalBarChart.web';
import type { CategoryBreakdown } from './FinancialDashboard.types';

interface CategoryBreakdownSectionProps {
  categories: CategoryBreakdown[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'Housing': '#C9B06B',       // Antique gold
  'Transportation': '#B8A089', // Warm bronze
  'Food & Dining': '#D4A87C',  // Copper
  'Shopping': '#C2A0B0',       // Rose gold
  'Entertainment': '#A8B4C0',  // Platinum
  'Health & Fitness': '#8ABAB0', // Patina silver-teal
  'Health': '#8ABAB0',         // Patina silver-teal
  'Personal': '#B09A8A',       // Pewter rose
  'Financial': '#9AA08A',      // Aged brass
  'Subscriptions': '#CDD4DB',  // Bright silver
  'Income': '#D4C896',         // Champagne gold
  'Other': '#8C8A80',          // Gunmetal
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
