import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandColors, nativeSpacing, dashboardIdentity, nativeSurfaces, nativeSurfaceIdentity } from '../../tokens/native';
import { HorizontalBarChart } from '../Charts/HorizontalBarChart.native';
import { PeriodSelector } from '../Charts/PeriodSelector.native';
import { Button } from '../Button/Button.native';
import type { FinancialDashboardProps, FinancialOverview, CategoryBreakdown } from './FinancialDashboard.types';

function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Housing': brandColors.veridian,
  'Transportation': brandColors.caution,
  'Food & Dining': brandColors.critical,
  'Shopping': brandColors.sv2,
  'Entertainment': brandColors.sv3,
  'Other': brandColors.sv1,
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? brandColors.sv2;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  annual: '/yr',
};

function getTrendInfo(overview: FinancialOverview): { label: string; style: 'down' | 'up' | 'stable'; arrow: string } | null {
  if (overview.previousPeriodSpending === null) return null;

  const diff = overview.totalSpending - overview.previousPeriodSpending;
  const pct = overview.previousPeriodSpending > 0
    ? Math.round((Math.abs(diff) / overview.previousPeriodSpending) * 100)
    : 0;

  if (diff < 0) return { label: `${pct}% less than last period`, style: 'down', arrow: '\u2193' };
  if (diff > 0) return { label: `${pct}% more than last period`, style: 'up', arrow: '\u2191' };
  return { label: 'Same as last period', style: 'stable', arrow: '\u2194' };
}

const TREND_STYLES = {
  down: { color: brandColors.veridian, bg: 'rgba(110,207,163,0.08)', border: 'rgba(110,207,163,0.15)' },
  up: { color: brandColors.critical, bg: 'rgba(176,122,138,0.08)', border: 'rgba(176,122,138,0.15)' },
  stable: { color: brandColors.sv2, bg: 'rgba(133,147,164,0.08)', border: 'rgba(133,147,164,0.15)' },
};

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
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>{t('financialDashboard.title')}</Text>
        <View style={styles.skeletonBar} />
        <View style={[styles.skeletonBar, { width: '60%' }]} />
        <View style={[styles.skeletonBar, { width: '40%' }]} />
      </View>
    );
  }

  if (!overview && categories.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t('financialDashboard.emptyTitle')}</Text>
        <Text style={styles.emptyText}>{t('financialDashboard.emptyText')}</Text>
        <Button variant="opal" size="sm" onPress={onImportStatement}>{t('financialDashboard.importStatement')}</Button>
      </View>
    );
  }

  const chartData = categories.map((c: CategoryBreakdown) => ({
    label: c.category,
    value: c.total,
    percentage: c.percentage,
    color: getCategoryColor(c.category),
  }));

  const forgottenCharges = subscriptions.charges.filter((c) => c.status === 'forgotten');
  const activeCharges = subscriptions.charges.filter((c) => c.status !== 'forgotten' && c.status !== 'cancelled');

  const trend = overview ? getTrendInfo(overview) : null;
  const days = overview
    ? Math.max(1, Math.ceil((new Date(overview.periodEnd).getTime() - new Date(overview.periodStart).getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const dailyAvg = overview ? overview.totalSpending / days : 0;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('financialDashboard.title')}</Text>
        <PeriodSelector selected={selectedPeriod} onSelect={onPeriodChange} />
      </View>

      {/* Overview Stats — 2-column grid */}
      {overview && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('financialDashboard.overview', { defaultValue: 'Overview' })}</Text>
          <View style={styles.statsGrid}>
            <View style={styles.stat}>
              <Text style={styles.statValue} accessibilityLabel={t('financialDashboard.totalSpendingLabel', { amount: formatCurrency(overview.totalSpending) })}>
                {formatCurrency(overview.totalSpending)}
              </Text>
              <Text style={styles.statLabel}>TOTAL SPENT</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatCurrency(dailyAvg)}</Text>
              <Text style={styles.statLabel}>DAILY AVERAGE</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{overview.transactionCount}</Text>
              <Text style={styles.statLabel}>TRANSACTIONS</Text>
            </View>
            {trend && (
              <View style={styles.stat}>
                <View style={[styles.trendBadge, { backgroundColor: TREND_STYLES[trend.style].bg, borderColor: TREND_STYLES[trend.style].border }]}>
                  <Text style={[styles.trendText, { color: TREND_STYLES[trend.style].color }]}>
                    {trend.arrow} {trend.label}
                  </Text>
                </View>
              </View>
            )}
          </View>
          <Text style={styles.meta}>{overview.periodStart} — {overview.periodEnd}</Text>
          <View style={styles.divider} />
        </View>
      )}

      {/* Category Breakdown */}
      {chartData.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('financialDashboard.spendingByCategory')}</Text>
          <HorizontalBarChart data={chartData} formatValue={formatCurrency} />
        </View>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('financialDashboard.anomalies', { count: anomalies.length })}
          </Text>
          {anomalies.map((a) => (
            <View key={a.id} style={styles.anomalyCard}>
              <View style={styles.anomalyHeader}>
                <Text style={styles.anomalyTitle}>{a.title}</Text>
                <Text style={styles.anomalyAmount}>{formatCurrency(a.amount)}</Text>
              </View>
              <Text style={styles.anomalyDesc}>{a.description}</Text>
              <TouchableOpacity onPress={() => onDismissAnomaly(a.id)}>
                <Text style={styles.ghostBtnText}>{t('common.dismiss')}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Subscriptions */}
      {subscriptions.charges.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Subscriptions ({subscriptions.summary.activeCount} active)
          </Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryValue}>
              {formatCurrency(subscriptions.summary.totalMonthly)}/mo
            </Text>
            <Text style={styles.meta}>
              {formatCurrency(subscriptions.summary.totalAnnual)}/yr
            </Text>
          </View>

          {forgottenCharges.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: brandColors.critical }]}>
                Potentially Forgotten ({forgottenCharges.length})
              </Text>
              {forgottenCharges.map((charge) => (
                <View key={charge.id} style={styles.row}>
                  <Text style={[styles.rowLabel, { color: brandColors.wDim }]}>{charge.merchantName}</Text>
                  <Text style={[styles.rowValue, { color: brandColors.critical }]}>
                    {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
                  </Text>
                  <View style={styles.rowActions}>
                    <TouchableOpacity onPress={() => onCancelSubscription(charge.id)}>
                      <Text style={styles.ghostBtnText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onKeepSubscription(charge.id)}>
                      <Text style={styles.ghostBtnText}>{t('common.keep')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeCharges.map((charge) => (
            <View key={charge.id} style={styles.row}>
              <Text style={styles.rowLabel}>{charge.merchantName}</Text>
              <Text style={styles.rowValue}>
                {formatCurrency(charge.amount)}{FREQ_LABELS[charge.frequency] ?? '/mo'}
              </Text>
            </View>
          ))}

          {subscriptions.summary.potentialSavings > 0 && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>
                Potential savings: {formatCurrency(subscriptions.summary.potentialSavings)}/yr
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Import */}
      <View style={styles.importArea}>
        <Text style={styles.importText}>{t('dashboard.financial.import_prompt')}</Text>
        <Button variant="opal" size="sm" onPress={onImportStatement}>{t('financialDashboard.importStatement')}</Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0E11' },
  content: { padding: nativeSpacing.s5, gap: nativeSpacing.s5, borderWidth: 1, borderColor: nativeSurfaceIdentity.financial.borderColor, borderRadius: 12 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Fraunces-Light', fontSize: 21, fontWeight: '300', color: brandColors.white },

  // Section
  section: { gap: nativeSpacing.s4 },
  sectionTitle: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    fontWeight: '400',
    color: brandColors.slate3,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },

  // Stats grid — 2 column
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s4,
  },
  stat: {
    width: '47%',
    gap: nativeSpacing.s1,
  },
  statValue: {
    fontFamily: 'Fraunces-Light',
    fontWeight: '300',
    fontSize: 24,
    color: brandColors.white,
  },
  statLabel: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    fontWeight: '400',
    color: brandColors.sv1,
    letterSpacing: 1.1,
  },

  // Trend badge
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s1,
    paddingVertical: nativeSpacing.s1,
    paddingHorizontal: nativeSpacing.s3,
    borderRadius: 4,
    borderWidth: 1,
  },
  trendText: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    fontWeight: '500',
  },

  // Divider
  divider: {
    height: 1,
    width: 72,
    backgroundColor: brandColors.veridian,
    opacity: 0.5,
  },

  // Meta text
  meta: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: brandColors.sv1,
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  summaryValue: {
    fontFamily: 'DMMono-Regular',
    fontSize: 13,
    color: brandColors.sv3,
  },

  // Settings-style rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: nativeSpacing.s2,
  },
  rowLabel: {
    flex: 1,
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: brandColors.sv3,
  },
  rowValue: {
    fontFamily: 'DMMono-Regular',
    fontSize: 13,
    color: brandColors.sv2,
  },
  rowActions: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
  },

  // Anomaly cards
  anomalyCard: {
    backgroundColor: brandColors.s1,
    borderRadius: 12,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s2,
  },
  anomalyHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  anomalyTitle: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.wDim },
  anomalyAmount: { fontFamily: 'DMMono-Regular', fontSize: 13, color: brandColors.wDim },
  anomalyDesc: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.sv2 },

  // Savings badge
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s3,
    backgroundColor: 'rgba(110,207,163,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(110,207,163,0.15)',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  savingsText: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    fontWeight: '500',
    color: brandColors.veridian,
  },

  // Ghost button
  ghostBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: brandColors.veridianWire,
    borderRadius: 4,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s3,
    alignItems: 'center',
  },
  ghostBtnText: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: brandColors.veridian,
  },

  // Import area
  importArea: {
    alignItems: 'center',
    gap: nativeSpacing.s3,
    padding: nativeSpacing.s6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  importText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: brandColors.sv2,
    textAlign: 'center',
  },

  // Empty state
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s4,
    padding: nativeSpacing.s6,
  },
  emptyTitle: { fontFamily: 'Fraunces-Light', fontSize: 17, fontWeight: '300', color: brandColors.wDim },
  emptyText: { fontFamily: 'DMSans-Regular', fontSize: 13, color: brandColors.sv2, textAlign: 'center', maxWidth: 360 },

  // Skeleton
  skeletonBar: {
    height: 16,
    backgroundColor: brandColors.s2,
    borderRadius: 4,
    width: '80%',
  },
});
