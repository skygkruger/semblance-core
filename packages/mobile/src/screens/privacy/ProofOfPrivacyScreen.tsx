// ProofOfPrivacyScreen — Mobile interface for generating a Proof of Privacy report.
// Premium-gated. Report history, export via share sheet.
// Business logic in packages/core/. Props-driven presentation only.
// CRITICAL: No networking imports. Report generation is local-only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface PrivacyReport {
  id: string;
  generatedAt: string;
  durationDays: number;
  guaranteesVerified: number;
  guaranteesTotal: number;
  networkRequestsAudited: number;
  unauthorizedAttempts: number;
}

export interface ProofOfPrivacyScreenProps {
  reports: PrivacyReport[];
  isPremium: boolean;
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
  onExportReport: (reportId: string) => Promise<void>;
}

export const ProofOfPrivacyScreen: React.FC<ProofOfPrivacyScreenProps> = ({
  reports,
  isPremium,
  isGenerating,
  onGenerate,
  onExportReport,
}) => {
  const handleGenerate = async () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Proof of Privacy reports require Semblance Premium.');
      return;
    }
    await onGenerate();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Proof of Privacy</Text>
      <Text style={styles.subtitle}>
        Verifiable proof that Semblance operates within its privacy guarantees.
      </Text>

      <TouchableOpacity
        style={[styles.generateButton, (isGenerating || !isPremium) && styles.buttonDisabled]}
        onPress={handleGenerate}
        disabled={isGenerating}
      >
        <Text style={styles.generateButtonText}>
          {isGenerating ? 'Generating...' : 'Generate New Report'}
        </Text>
      </TouchableOpacity>

      {!isPremium && (
        <Text style={styles.premiumNotice}>Premium required for report generation</Text>
      )}

      {/* Report History */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Report History</Text>
        {reports.length === 0 && (
          <Text style={styles.emptyText}>No reports generated yet.</Text>
        )}
        {reports.map(report => (
          <View key={report.id} style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportDate}>
                {new Date(report.generatedAt).toLocaleDateString()}
              </Text>
              <Text style={styles.reportDuration}>{report.durationDays}-day period</Text>
            </View>
            <View style={styles.reportStats}>
              <View style={styles.reportStat}>
                <Text style={styles.reportStatValue}>
                  {report.guaranteesVerified}/{report.guaranteesTotal}
                </Text>
                <Text style={styles.reportStatLabel}>Guarantees verified</Text>
              </View>
              <View style={styles.reportStat}>
                <Text style={styles.reportStatValue}>{report.networkRequestsAudited}</Text>
                <Text style={styles.reportStatLabel}>Requests audited</Text>
              </View>
              <View style={styles.reportStat}>
                <Text style={[
                  styles.reportStatValue,
                  { color: report.unauthorizedAttempts === 0 ? colors.success : colors.attention },
                ]}>
                  {report.unauthorizedAttempts}
                </Text>
                <Text style={styles.reportStatLabel}>Unauthorized</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => onExportReport(report.id)}
            >
              <Text style={styles.exportButtonText}>Export</Text>
            </TouchableOpacity>
          </View>
        ))}
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
  },
  generateButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  generateButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  premiumNotice: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  section: { marginTop: spacing.md },
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
  },
  reportCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  reportDate: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  reportDuration: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  reportStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md },
  reportStat: { alignItems: 'center' },
  reportStatValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  reportStatLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  exportButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
});
