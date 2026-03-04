import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { brandColors, nativeSpacing } from '../../tokens/native';
import { HorizontalBarChart } from '../Charts/HorizontalBarChart.native';
import { PeriodSelector } from '../Charts/PeriodSelector.native';
import type { FinancialDashboardProps, CategoryBreakdown } from './FinancialDashboard.types';

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Housing': brandColors.veridian,
  'Transportation': brandColors.amber,
  'Food & Dining': brandColors.rust,
  'Shopping': brandColors.silver2,
  'Entertainment': brandColors.silver3,
  'Other': brandColors.silver1,
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? brandColors.silver2;
}

export function FinancialDashboard({
  overview,
  categories,
  anomalies,
  subscriptions,
  selectedPeriod,
  onPeriodChange,
  onDismissAnomaly,
  onCancelSubscription,
  onKeepSubscription,
  onImportStatement,
  loading,
}: FinancialDashboardProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Financial Overview</Text>
        <View style={styles.skeleton} />
        <View style={[styles.skeleton, { width: '60%' }]} />
      </View>
    );
  }

  if (!overview && categories.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No Financial Data Yet</Text>
        <Text style={styles.emptyText}>
          Import a bank or credit card statement to get started.
        </Text>
        <TouchableOpacity style={styles.importBtn} onPress={onImportStatement}>
          <Text style={styles.importBtnText}>Import Statement</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chartData = categories.map((c: CategoryBreakdown) => ({
    label: c.category,
    value: c.total,
    percentage: c.percentage,
    color: getCategoryColor(c.category),
  }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Financial Overview</Text>
        <PeriodSelector selected={selectedPeriod} onSelect={onPeriodChange} />
      </View>

      {overview && (
        <View style={styles.overviewCard}>
          <Text style={styles.total} accessibilityLabel={`Total spending: ${formatCurrency(overview.totalSpending)}`}>
            {formatCurrency(overview.totalSpending)}
          </Text>
          <Text style={styles.meta}>
            {overview.transactionCount} transactions
          </Text>
        </View>
      )}

      {chartData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          <HorizontalBarChart data={chartData} formatValue={formatCurrency} />
        </View>
      )}

      {anomalies.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Anomalies ({anomalies.length})</Text>
          {anomalies.map((a) => (
            <View key={a.id} style={styles.anomalyCard}>
              <View style={styles.anomalyHeader}>
                <Text style={styles.anomalyTitle}>{a.title}</Text>
                <Text style={styles.anomalyAmount}>{formatCurrency(a.amount)}</Text>
              </View>
              <Text style={styles.anomalyDesc}>{a.description}</Text>
              <TouchableOpacity onPress={() => onDismissAnomaly(a.id)}>
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {subscriptions.charges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Subscriptions ({subscriptions.summary.activeCount} active)
          </Text>
          <Text style={styles.meta}>
            {formatCurrency(subscriptions.summary.totalMonthly)}/mo
          </Text>
          {subscriptions.charges
            .filter((c) => c.status === 'forgotten')
            .map((charge) => (
              <View key={charge.id} style={styles.anomalyCard}>
                <Text style={styles.anomalyTitle}>{charge.merchantName}</Text>
                <Text style={styles.anomalyAmount}>{formatCurrency(charge.amount)}/mo</Text>
                <View style={styles.chargeActions}>
                  <TouchableOpacity onPress={() => onCancelSubscription(charge.id)}>
                    <Text style={styles.dismissText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onKeepSubscription(charge.id)}>
                    <Text style={styles.dismissText}>Keep</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
        </View>
      )}

      <TouchableOpacity style={styles.importBtn} onPress={onImportStatement}>
        <Text style={styles.importBtnText}>Import Statement</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: nativeSpacing.sp5, gap: nativeSpacing.sp5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Fraunces-Regular', fontSize: 21, color: brandColors.white },
  overviewCard: {
    backgroundColor: brandColors.surface1,
    borderRadius: 12,
    padding: nativeSpacing.sp5,
    gap: nativeSpacing.sp2,
  },
  total: { fontFamily: 'DMMono-Regular', fontSize: 38, color: brandColors.whiteDim },
  meta: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver1 },
  section: { gap: nativeSpacing.sp3 },
  sectionTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: brandColors.silver3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  anomalyCard: {
    backgroundColor: brandColors.surface1,
    borderRadius: 12,
    padding: nativeSpacing.sp4,
    gap: nativeSpacing.sp2,
  },
  anomalyHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  anomalyTitle: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.whiteDim },
  anomalyAmount: { fontFamily: 'DMMono-Regular', fontSize: 13, color: brandColors.whiteDim },
  anomalyDesc: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver2 },
  dismissText: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver2 },
  chargeActions: { flexDirection: 'row', gap: nativeSpacing.sp3 },
  importBtn: {
    backgroundColor: brandColors.veridian,
    borderRadius: 8,
    padding: nativeSpacing.sp3,
    alignItems: 'center',
  },
  importBtnText: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.background },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: nativeSpacing.sp4, padding: nativeSpacing.sp6 },
  emptyTitle: { fontFamily: 'Fraunces-Regular', fontSize: 17, color: brandColors.whiteDim },
  emptyText: { fontFamily: 'DMSans-Regular', fontSize: 13, color: brandColors.silver2, textAlign: 'center' },
  skeleton: {
    height: 16,
    backgroundColor: brandColors.surface2,
    borderRadius: 4,
    width: '80%',
  },
});
