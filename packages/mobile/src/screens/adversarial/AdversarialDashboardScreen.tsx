// AdversarialDashboardScreen — Mobile interface for Adversarial Self-Defense.
// Dark pattern alerts, manipulation reframes, subscription value-to-cost, opt-out autopilot.
// Business logic in packages/core/. Props-driven presentation only.
// CRITICAL: No networking imports. All analysis is local-only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface DarkPatternAlert {
  id: string;
  source: string;
  patternType: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  detectedAt: string;
  reframe: string;
}

export interface SubscriptionAssessment {
  id: string;
  name: string;
  monthlyCost: number;
  usageScore: number;
  recommendation: 'keep' | 'review' | 'cancel';
  reasoning: string;
}

export interface OptOutStatus {
  totalTracked: number;
  pendingOptOuts: number;
  completedOptOuts: number;
  autopilotEnabled: boolean;
}

export interface AdversarialDashboardScreenProps {
  alerts: DarkPatternAlert[];
  subscriptions: SubscriptionAssessment[];
  optOutStatus: OptOutStatus;
  onDismissAlert: (id: string) => void;
  onReviewSubscription: (id: string) => void;
  onToggleAutopilot: (enabled: boolean) => void;
}

export const AdversarialDashboardScreen: React.FC<AdversarialDashboardScreenProps> = ({
  alerts,
  subscriptions,
  optOutStatus,
  onDismissAlert,
  onReviewSubscription,
  onToggleAutopilot,
}) => {
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const severityColor = (severity: DarkPatternAlert['severity']): string => {
    if (severity === 'high') return colors.attention;
    if (severity === 'medium') return colors.accent;
    return colors.textTertiary;
  };

  const recommendationColor = (rec: SubscriptionAssessment['recommendation']): string => {
    if (rec === 'cancel') return colors.attention;
    if (rec === 'review') return colors.accent;
    return colors.success;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Adversarial Defense</Text>
      <Text style={styles.subtitle}>
        Protecting you from dark patterns, manipulation, and value-extracting subscriptions.
      </Text>

      {/* Dark Pattern Alerts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dark Pattern Alerts</Text>
        {alerts.length === 0 && (
          <Text style={styles.emptyText}>No dark patterns detected recently.</Text>
        )}
        {alerts.map(alert => (
          <TouchableOpacity
            key={alert.id}
            style={styles.alertCard}
            onPress={() => setExpandedAlertId(expandedAlertId === alert.id ? null : alert.id)}
          >
            <View style={styles.alertHeader}>
              <View style={[styles.severityBadge, { backgroundColor: severityColor(alert.severity) }]}>
                <Text style={styles.severityText}>{alert.severity}</Text>
              </View>
              <View style={styles.alertInfo}>
                <Text style={styles.alertSource}>{alert.source}</Text>
                <Text style={styles.alertPattern}>{alert.patternType}</Text>
              </View>
              <TouchableOpacity onPress={() => onDismissAlert(alert.id)}>
                <Text style={styles.dismissButton}>[x]</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.alertDescription}>{alert.description}</Text>

            {expandedAlertId === alert.id && (
              <View style={styles.reframeBox}>
                <Text style={styles.reframeLabel}>Reframe:</Text>
                <Text style={styles.reframeText}>{alert.reframe}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Subscription Value-to-Cost */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription Assessment</Text>
        {subscriptions.map(sub => (
          <TouchableOpacity
            key={sub.id}
            style={styles.subCard}
            onPress={() => onReviewSubscription(sub.id)}
          >
            <View style={styles.subHeader}>
              <Text style={styles.subName}>{sub.name}</Text>
              <Text style={styles.subCost}>${sub.monthlyCost.toFixed(2)}/mo</Text>
            </View>
            <View style={styles.subMeta}>
              <Text style={styles.subUsage}>Usage: {Math.round(sub.usageScore * 100)}%</Text>
              <Text style={[styles.subRec, { color: recommendationColor(sub.recommendation) }]}>
                {sub.recommendation}
              </Text>
            </View>
            <Text style={styles.subReasoning}>{sub.reasoning}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Opt-Out Autopilot */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Opt-Out Autopilot</Text>
        <View style={styles.autopilotCard}>
          <View style={styles.autopilotStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{optOutStatus.totalTracked}</Text>
              <Text style={styles.statLabel}>Tracked</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{optOutStatus.pendingOptOuts}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{optOutStatus.completedOptOuts}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.autopilotToggle}
            onPress={() => onToggleAutopilot(!optOutStatus.autopilotEnabled)}
          >
            <Text style={styles.autopilotLabel}>Autopilot</Text>
            <Text style={[styles.autopilotValue, { color: optOutStatus.autopilotEnabled ? colors.success : colors.textTertiary }]}>
              {optOutStatus.autopilotEnabled ? 'On' : 'Off'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    paddingVertical: spacing.md,
  },
  alertCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  severityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  severityText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  alertInfo: { flex: 1 },
  alertSource: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  alertPattern: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  dismissButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textTertiary,
    padding: spacing.xs,
  },
  alertDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 18,
  },
  reframeBox: {
    backgroundColor: colors.surface2Dark,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  reframeLabel: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  reframeText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    lineHeight: 18,
  },
  subCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  subHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subName: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  subCost: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
  subMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  subUsage: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  subRec: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    textTransform: 'uppercase',
  },
  subReasoning: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  autopilotCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
  },
  autopilotStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
  },
  statItem: { alignItems: 'center' },
  statValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  statLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  autopilotToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  autopilotLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  autopilotValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});
