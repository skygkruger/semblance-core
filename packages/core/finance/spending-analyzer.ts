/**
 * Spending Analyzer — Monthly breakdowns, trends, insights, and comparisons.
 *
 * All amounts in cents. Pure arithmetic — no LLM calls.
 */

import type { TransactionStore, CategorySpending } from './transaction-store.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MonthlyBreakdown {
  year: number;
  month: number;
  totalSpending: number;      // cents (absolute)
  totalIncome: number;        // cents
  categoryBreakdown: CategorySpending[];
  dailyAverage: number;       // cents
  transactionCount: number;
}

export interface MonthComparison {
  current: MonthlyBreakdown;
  previous: MonthlyBreakdown;
  changePercent: number;      // positive = spending increased
  categoryChanges: CategoryChange[];
}

export interface CategoryChange {
  category: string;
  currentTotal: number;       // cents
  previousTotal: number;      // cents
  changePercent: number;
  direction: 'up' | 'down' | 'flat' | 'new';
}

export interface SpendingTrend {
  year: number;
  month: number;
  label: string;              // "Jan '26"
  totalSpending: number;      // cents
  totalIncome: number;        // cents
}

export interface MerchantSpending {
  merchantNormalized: string;
  total: number;              // cents (absolute)
  count: number;
  averageAmount: number;      // cents
}

export interface SpendingInsight {
  type: 'category-increase' | 'category-decrease' | 'subscription-renewal' | 'high-spending-day';
  severity: 'warning' | 'info';
  title: string;
  description: string;
  data: Record<string, unknown>;
}

// ─── Spending Analyzer ──────────────────────────────────────────────────────

export class SpendingAnalyzer {
  private store: TransactionStore;

  constructor(store: TransactionStore) {
    this.store = store;
  }

  getMonthlyBreakdown(year: number, month: number): MonthlyBreakdown {
    const categoryBreakdown = this.store.getMonthlySpending(year, month);
    const mom = this.store.getMonthOverMonth(year, month);
    const daysInMonth = new Date(year, month, 0).getDate();

    return {
      year,
      month,
      totalSpending: mom.current.totalSpending,
      totalIncome: mom.current.totalIncome,
      categoryBreakdown,
      dailyAverage: daysInMonth > 0 ? Math.round(mom.current.totalSpending / daysInMonth) : 0,
      transactionCount: mom.current.transactionCount,
    };
  }

  getMonthComparison(year: number, month: number): MonthComparison {
    const current = this.getMonthlyBreakdown(year, month);

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const previous = this.getMonthlyBreakdown(prevYear, prevMonth);

    const changePercent = previous.totalSpending > 0
      ? Math.round(((current.totalSpending - previous.totalSpending) / previous.totalSpending) * 10000) / 100
      : 0;

    // Build category change list
    const allCategories = new Set([
      ...current.categoryBreakdown.map(c => c.category),
      ...previous.categoryBreakdown.map(c => c.category),
    ]);

    const categoryChanges: CategoryChange[] = [];
    for (const cat of allCategories) {
      const cur = current.categoryBreakdown.find(c => c.category === cat)?.total ?? 0;
      const prev = previous.categoryBreakdown.find(c => c.category === cat)?.total ?? 0;

      let direction: CategoryChange['direction'];
      let cp: number;

      if (prev === 0 && cur > 0) {
        direction = 'new';
        cp = 100;
      } else if (prev > 0) {
        cp = Math.round(((cur - prev) / prev) * 10000) / 100;
        if (cp > 5) direction = 'up';
        else if (cp < -5) direction = 'down';
        else direction = 'flat';
      } else {
        direction = 'flat';
        cp = 0;
      }

      categoryChanges.push({
        category: cat,
        currentTotal: cur,
        previousTotal: prev,
        changePercent: cp,
        direction,
      });
    }

    // Sort by absolute change
    categoryChanges.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

    return { current, previous, changePercent, categoryChanges };
  }

  getSpendingTrends(months: number = 6): SpendingTrend[] {
    const trends: SpendingTrend[] = [];
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1-indexed

    for (let i = 0; i < months; i++) {
      const mom = this.store.getMonthOverMonth(year, month);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const label = `${monthNames[month - 1]} '${String(year).slice(2)}`;

      trends.unshift({
        year,
        month,
        label,
        totalSpending: mom.current.totalSpending,
        totalIncome: mom.current.totalIncome,
      });

      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
    }

    return trends;
  }

  getTopMerchants(startDate: string, endDate: string, limit: number = 10): MerchantSpending[] {
    const txns = this.store.getTransactions({ startDate, endDate });
    const map = new Map<string, { total: number; count: number }>();

    for (const t of txns) {
      if (t.amount >= 0) continue; // skip income
      const key = t.merchantNormalized || t.merchantRaw;
      const existing = map.get(key) ?? { total: 0, count: 0 };
      existing.total += Math.abs(t.amount);
      existing.count++;
      map.set(key, existing);
    }

    return Array.from(map.entries())
      .map(([merchant, data]) => ({
        merchantNormalized: merchant,
        total: data.total,
        count: data.count,
        averageAmount: data.count > 0 ? Math.round(data.total / data.count) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  generateInsights(year: number, month: number): SpendingInsight[] {
    const insights: SpendingInsight[] = [];
    const comparison = this.getMonthComparison(year, month);

    // Category increase > 25%
    for (const change of comparison.categoryChanges) {
      if (change.direction === 'up' && change.changePercent > 25 && change.previousTotal > 0) {
        insights.push({
          type: 'category-increase',
          severity: 'warning',
          title: `${change.category} spending up ${Math.round(change.changePercent)}%`,
          description: `You spent $${(change.currentTotal / 100).toFixed(2)} on ${change.category} this month, up from $${(change.previousTotal / 100).toFixed(2)} last month.`,
          data: { category: change.category, changePercent: change.changePercent },
        });
      }

      // Category decrease > 25%
      if (change.direction === 'down' && change.changePercent < -25 && change.previousTotal > 0) {
        insights.push({
          type: 'category-decrease',
          severity: 'info',
          title: `${change.category} spending down ${Math.abs(Math.round(change.changePercent))}%`,
          description: `You spent $${(change.currentTotal / 100).toFixed(2)} on ${change.category} this month, down from $${(change.previousTotal / 100).toFixed(2)} last month.`,
          data: { category: change.category, changePercent: change.changePercent },
        });
      }
    }

    // High-spending day: any day > 3x daily average
    if (comparison.current.dailyAverage > 0) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const txns = this.store.getTransactions({ startDate, endDate });

      const dailyTotals = new Map<string, number>();
      for (const t of txns) {
        if (t.amount >= 0) continue;
        const day = t.date;
        dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + Math.abs(t.amount));
      }

      for (const [day, total] of dailyTotals) {
        if (total > comparison.current.dailyAverage * 3) {
          insights.push({
            type: 'high-spending-day',
            severity: 'info',
            title: `High spending on ${day}`,
            description: `$${(total / 100).toFixed(2)} spent on ${day}, which is ${Math.round(total / comparison.current.dailyAverage)}x your daily average.`,
            data: { date: day, total, dailyAverage: comparison.current.dailyAverage },
          });
        }
      }
    }

    return insights;
  }
}
