// SovereigntyStatusCard — Summary card for Settings screen.
// Shows Living Will export status and Inheritance Protocol status at a glance.
// Props-driven, no business logic. No networking.

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

export interface SovereigntyStatusProps {
  livingWillLastExport: string | null;
  livingWillEnabled: boolean;
  inheritanceEnabled: boolean;
  inheritanceTrustedPartyCount: number;
  networkPeerCount: number;
  onNavigateToLivingWill: () => void;
  onNavigateToInheritance: () => void;
  onNavigateToNetwork: () => void;
}

export const SovereigntyStatusCard: React.FC<SovereigntyStatusProps> = ({
  livingWillLastExport,
  livingWillEnabled,
  inheritanceEnabled,
  inheritanceTrustedPartyCount,
  networkPeerCount,
  onNavigateToLivingWill,
  onNavigateToInheritance,
  onNavigateToNetwork,
}) => {
  const formatDate = (iso: string | null): string => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your Digital Twin</Text>

      <TouchableOpacity style={styles.row} onPress={onNavigateToLivingWill}>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>Living Will</Text>
          <Text style={styles.rowDescription}>
            {livingWillEnabled ? `Last export: ${formatDate(livingWillLastExport)}` : 'Not configured'}
          </Text>
        </View>
        <Text style={styles.chevron}>&gt;</Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      <TouchableOpacity style={styles.row} onPress={onNavigateToInheritance}>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>Inheritance</Text>
          <Text style={styles.rowDescription}>
            {inheritanceEnabled
              ? `${inheritanceTrustedPartyCount} trusted ${inheritanceTrustedPartyCount === 1 ? 'party' : 'parties'}`
              : 'Disabled'}
          </Text>
        </View>
        <Text style={styles.chevron}>&gt;</Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      <TouchableOpacity style={styles.row} onPress={onNavigateToNetwork}>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>Network</Text>
          <Text style={styles.rowDescription}>
            {networkPeerCount > 0
              ? `${networkPeerCount} ${networkPeerCount === 1 ? 'peer' : 'peers'} connected`
              : 'No peers'}
          </Text>
        </View>
        <Text style={styles.chevron}>&gt;</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: 'hidden',
  },
  title: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    padding: spacing.base,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  rowDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  chevron: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textTertiary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginLeft: spacing.base,
  },
});
