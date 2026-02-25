// PrivacyDashboardScreen — Mobile interface for Privacy Dashboard.
// 5 collapsible sections, Comparison Statement, data inventory, network activity, privacy guarantees.
// Business logic in packages/core/. Props-driven presentation only.
// CRITICAL: No networking imports. Privacy dashboard is entirely local.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface PrivacyGuarantee {
  id: string;
  label: string;
  description: string;
  verified: boolean;
}

export interface DataInventoryItem {
  category: string;
  itemCount: number;
  lastUpdated: string;
  storageBytes: number;
}

export interface NetworkActivityEntry {
  service: string;
  requestCount: number;
  lastRequestAt: string;
  status: 'authorized' | 'blocked';
}

export interface ComparisonCounts {
  localOnlyDataPoints: number;
  cloudCompetitorDataPoints: number;
  actionsLogged: number;
  actionsReversible: number;
}

export interface PrivacyDashboardScreenProps {
  guarantees: PrivacyGuarantee[];
  dataInventory: DataInventoryItem[];
  networkActivity: NetworkActivityEntry[];
  comparison: ComparisonCounts;
  auditTrailSize: number;
  onNavigateToProofOfPrivacy: () => void;
  onNavigateToNetworkMonitor: () => void;
}

type SectionId = 'guarantees' | 'inventory' | 'network' | 'comparison' | 'audit';

export const PrivacyDashboardScreen: React.FC<PrivacyDashboardScreenProps> = ({
  guarantees,
  dataInventory,
  networkActivity,
  comparison,
  auditTrailSize,
  onNavigateToProofOfPrivacy,
  onNavigateToNetworkMonitor,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(
    new Set(['guarantees']),
  );

  const toggleSection = (id: SectionId) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Dashboard</Text>
      <Text style={styles.subtitle}>
        Complete visibility into what Semblance stores, accesses, and transmits.
      </Text>

      {/* Section 1: Privacy Guarantees */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('guarantees')}
      >
        <Text style={styles.sectionTitle}>Privacy Guarantees</Text>
        <Text style={styles.chevron}>{expandedSections.has('guarantees') ? '[-]' : '[+]'}</Text>
      </TouchableOpacity>
      {expandedSections.has('guarantees') && (
        <View style={styles.sectionBody}>
          {guarantees.map(g => (
            <View key={g.id} style={styles.guaranteeRow}>
              <Text style={[styles.checkmark, { color: g.verified ? colors.success : colors.attention }]}>
                {g.verified ? '[v]' : '[x]'}
              </Text>
              <View style={styles.guaranteeInfo}>
                <Text style={styles.guaranteeLabel}>{g.label}</Text>
                <Text style={styles.guaranteeDesc}>{g.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Section 2: Data Inventory */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('inventory')}
      >
        <Text style={styles.sectionTitle}>Data Inventory</Text>
        <Text style={styles.chevron}>{expandedSections.has('inventory') ? '[-]' : '[+]'}</Text>
      </TouchableOpacity>
      {expandedSections.has('inventory') && (
        <View style={styles.sectionBody}>
          {dataInventory.map(item => (
            <View key={item.category} style={styles.inventoryRow}>
              <Text style={styles.inventoryCategory}>{item.category}</Text>
              <Text style={styles.inventoryCount}>{item.itemCount} items</Text>
              <Text style={styles.inventorySize}>{formatBytes(item.storageBytes)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Section 3: Network Activity */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('network')}
      >
        <Text style={styles.sectionTitle}>Network Activity</Text>
        <Text style={styles.chevron}>{expandedSections.has('network') ? '[-]' : '[+]'}</Text>
      </TouchableOpacity>
      {expandedSections.has('network') && (
        <View style={styles.sectionBody}>
          {networkActivity.map(entry => (
            <View key={entry.service} style={styles.networkRow}>
              <View style={styles.networkInfo}>
                <Text style={styles.networkService}>{entry.service}</Text>
                <Text style={styles.networkCount}>{entry.requestCount} requests</Text>
              </View>
              <Text style={[
                styles.networkStatus,
                { color: entry.status === 'authorized' ? colors.success : colors.attention },
              ]}>
                {entry.status}
              </Text>
            </View>
          ))}
          <TouchableOpacity onPress={onNavigateToNetworkMonitor}>
            <Text style={styles.viewAllLink}>View full Network Monitor &gt;</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Section 4: Comparison Statement */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('comparison')}
      >
        <Text style={styles.sectionTitle}>Comparison Statement</Text>
        <Text style={styles.chevron}>{expandedSections.has('comparison') ? '[-]' : '[+]'}</Text>
      </TouchableOpacity>
      {expandedSections.has('comparison') && (
        <View style={styles.sectionBody}>
          <View style={styles.comparisonGrid}>
            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonValue}>{comparison.localOnlyDataPoints.toLocaleString()}</Text>
              <Text style={styles.comparisonLabel}>Local-only data points</Text>
            </View>
            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonValue}>{comparison.cloudCompetitorDataPoints.toLocaleString()}</Text>
              <Text style={styles.comparisonLabel}>Cloud competitor would send</Text>
            </View>
            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonValue}>{comparison.actionsLogged.toLocaleString()}</Text>
              <Text style={styles.comparisonLabel}>Actions logged</Text>
            </View>
            <View style={styles.comparisonItem}>
              <Text style={styles.comparisonValue}>{comparison.actionsReversible.toLocaleString()}</Text>
              <Text style={styles.comparisonLabel}>Actions reversible</Text>
            </View>
          </View>
        </View>
      )}

      {/* Section 5: Audit Trail */}
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection('audit')}
      >
        <Text style={styles.sectionTitle}>Audit Trail</Text>
        <Text style={styles.chevron}>{expandedSections.has('audit') ? '[-]' : '[+]'}</Text>
      </TouchableOpacity>
      {expandedSections.has('audit') && (
        <View style={styles.sectionBody}>
          <Text style={styles.auditText}>
            {auditTrailSize.toLocaleString()} entries in append-only audit trail
          </Text>
          <Text style={styles.auditSubtext}>
            Every autonomous action is cryptographically chained and tamper-evident.
          </Text>
        </View>
      )}

      {/* Proof of Privacy Link */}
      <TouchableOpacity style={styles.proofButton} onPress={onNavigateToProofOfPrivacy}>
        <Text style={styles.proofButtonText}>Generate Proof of Privacy Report</Text>
      </TouchableOpacity>
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  chevron: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  sectionBody: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  guaranteeRow: { flexDirection: 'row', marginBottom: spacing.sm },
  checkmark: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    marginRight: spacing.sm,
    marginTop: 2,
  },
  guaranteeInfo: { flex: 1 },
  guaranteeLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  guaranteeDesc: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  inventoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  inventoryCategory: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    flex: 1,
  },
  inventoryCount: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginRight: spacing.md,
  },
  inventorySize: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    width: 60,
    textAlign: 'right',
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  networkInfo: { flex: 1 },
  networkService: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  networkCount: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  networkStatus: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
  },
  viewAllLink: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  comparisonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  comparisonItem: {
    width: '50%',
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  comparisonValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  comparisonLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  auditText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  auditSubtext: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  proofButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  proofButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
});
