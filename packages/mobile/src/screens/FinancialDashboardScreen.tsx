/**
 * Financial Dashboard Screen (Mobile) — Mobile-optimized financial overview.
 *
 * Swipe months, simplified horizontal bar charts, same data interfaces as desktop.
 * Uses React Native layout primitives.
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

// ─── Types ────────────────────────────────────────────────────────────────

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
  type: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
}

interface TransactionSummary {
  id: string;
  date: string;
  merchantNormalized: string;
  amount: number;
  category: string;
}

export interface FinancialDashboardScreenProps {
  isPremium: boolean;
  breakdown: MonthlyBreakdown | null;
  anomalies: Anomaly[];
  recentTransactions: TransactionSummary[];
  selectedYear: number;
  selectedMonth: number;
  onMonthChange: (year: number, month: number) => void;
  onDismissAnomaly: (id: string) => void;
  onActivateDigitalRepresentative: () => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export function FinancialDashboardScreen(props: FinancialDashboardScreenProps) {
  const { t } = useTranslation();
  const {
    isPremium,
    breakdown,
    anomalies,
    recentTransactions,
    selectedYear,
    selectedMonth,
    onMonthChange,
    onDismissAnomaly,
    onActivateDigitalRepresentative,
  } = props;

  const prevMonth = () => {
    const m = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const y = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    onMonthChange(y, m);
  };

  const nextMonth = () => {
    const m = selectedMonth === 12 ? 1 : selectedMonth + 1;
    const y = selectedMonth === 12 ? selectedYear + 1 : selectedYear;
    onMonthChange(y, m);
  };

  if (!isPremium) {
    return (
      <View style={styles.container} testID="financial-dashboard-free">
        <Text style={styles.title}>{t('screen.financial.title')}</Text>
        <View style={styles.card}>
          <Text style={styles.mutedText}>
            Unlock full financial intelligence with your Digital Representative.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onActivateDigitalRepresentative}>
            <Text style={styles.primaryButtonText}>{t('screen.financial.activate_dr')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} testID="financial-dashboard-premium">
      {/* Month Selector */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={prevMonth}>
          <Text style={styles.monthArrow}>&lt;</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</Text>
        <TouchableOpacity onPress={nextMonth}>
          <Text style={styles.monthArrow}>&gt;</Text>
        </TouchableOpacity>
      </View>

      {/* Summary */}
      {breakdown && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('screen.financial.spending')}</Text>
            <Text style={styles.summaryValue}>${(breakdown.totalSpending / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('screen.financial.income')}</Text>
            <Text style={styles.summaryValue}>${(breakdown.totalIncome / 100).toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Category Bars */}
      {breakdown && breakdown.categoryBreakdown.length > 0 && (
        <View style={styles.card} testID="category-bars">
          <Text style={styles.sectionTitle}>{t('screen.financial.by_category')}</Text>
          {breakdown.categoryBreakdown.map(cat => (
            <View key={cat.category} style={styles.categoryRow}>
              <View style={styles.categoryLabel}>
                <View style={[styles.colorDot, { backgroundColor: CATEGORY_COLORS[cat.category] ?? '#9e9e9e' }]} />
                <Text style={styles.categoryText}>{cat.category}</Text>
              </View>
              <View style={styles.barContainer}>
                <View style={[styles.bar, { width: `${Math.min(cat.percentage, 100)}%`, backgroundColor: CATEGORY_COLORS[cat.category] ?? '#9e9e9e' }]} />
              </View>
              <Text style={styles.categoryAmount}>${(cat.total / 100).toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <View testID="anomaly-alerts">
          <Text style={styles.sectionTitle}>{t('screen.financial.alerts')}</Text>
          {anomalies.map(a => (
            <View key={a.id} style={[styles.anomalyCard, a.severity === 'high' ? styles.anomalyHigh : null]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.anomalyTitle}>{a.title}</Text>
                <Text style={styles.anomalyDesc}>{a.description}</Text>
              </View>
              <TouchableOpacity onPress={() => onDismissAnomaly(a.id)}>
                <Text style={styles.dismissText}>{t('button.dismiss')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <View testID="recent-transactions">
          <Text style={styles.sectionTitle}>{t('screen.financial.recent')}</Text>
          {recentTransactions.slice(0, 10).map(txn => (
            <View key={txn.id} style={styles.txnRow}>
              <Text style={styles.txnDate}>{txn.date}</Text>
              <Text style={styles.txnMerchant} numberOfLines={1}>{txn.merchantNormalized}</Text>
              <Text style={[styles.txnAmount, txn.amount >= 0 ? styles.txnIncome : null]}>
                {txn.amount >= 0 ? '+' : ''}${(txn.amount / 100).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 16, color: '#e8e3e3' },
  card: { borderWidth: 1, borderColor: '#6e6a86', borderRadius: 8, padding: 16, marginBottom: 16 },
  mutedText: { color: '#6e6a86', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  primaryButton: { backgroundColor: '#7eb8da', borderRadius: 6, padding: 10, alignItems: 'center' },
  primaryButtonText: { color: '#1a1a2e', fontWeight: '600', fontSize: 14, fontFamily: 'monospace' },
  monthSelector: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginBottom: 16 },
  monthArrow: { fontSize: 18, color: '#6e6a86', paddingHorizontal: 8 },
  monthLabel: { fontSize: 16, fontFamily: 'monospace', color: '#e8e3e3' },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, borderWidth: 1, borderColor: '#6e6a86', borderRadius: 8, padding: 12 },
  summaryLabel: { color: '#6e6a86', fontSize: 12 },
  summaryValue: { fontSize: 20, fontFamily: 'monospace', color: '#e8e3e3', marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#e8e3e3', marginBottom: 8 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  categoryLabel: { flexDirection: 'row', alignItems: 'center', width: 120 },
  colorDot: { width: 8, height: 8, borderRadius: 2, marginRight: 6 },
  categoryText: { fontSize: 12, color: '#e8e3e3' },
  barContainer: { flex: 1, height: 8, backgroundColor: '#2a2a3e', borderRadius: 4, marginHorizontal: 8 },
  bar: { height: 8, borderRadius: 4 },
  categoryAmount: { fontSize: 12, fontFamily: 'monospace', color: '#e8e3e3', width: 50, textAlign: 'right' },
  anomalyCard: { borderWidth: 1, borderColor: '#6e6a86', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-start' },
  anomalyHigh: { borderColor: '#f27a93' },
  anomalyTitle: { fontSize: 13, fontWeight: '600', color: '#e8e3e3' },
  anomalyDesc: { fontSize: 11, color: '#6e6a86', marginTop: 2 },
  dismissText: { color: '#6e6a86', fontSize: 11 },
  txnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#2a2a3e' },
  txnDate: { fontSize: 11, fontFamily: 'monospace', color: '#6e6a86', width: 70 },
  txnMerchant: { flex: 1, fontSize: 13, color: '#e8e3e3' },
  txnAmount: { fontSize: 13, fontFamily: 'monospace', color: '#e8e3e3', width: 80, textAlign: 'right' },
  txnIncome: { color: '#7ec9a0' },
});
