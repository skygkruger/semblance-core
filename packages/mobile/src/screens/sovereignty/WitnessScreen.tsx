// WitnessScreen — Mobile interface for Semblance Witness (cryptographic attestation).
// Shows recent attestation list, detail view with verification, share via share sheet.
// Premium-gated feature — business logic in packages/core/.
// CRITICAL: No networking imports. Attestation verification is local-only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface Attestation {
  id: string;
  actionType: string;
  summary: string;
  timestamp: string;
  signatureValid: boolean;
  chainValid: boolean;
}

export interface WitnessScreenProps {
  attestations: Attestation[];
  isPremium: boolean;
  onSelectAttestation: (id: string) => void;
  onShareAttestation: (id: string) => Promise<void>;
  onVerifyAttestation: (id: string) => Promise<{ valid: boolean; details: string }>;
}

export const WitnessScreen: React.FC<WitnessScreenProps> = ({
  attestations,
  isPremium,
  onSelectAttestation,
  onShareAttestation,
  onVerifyAttestation,
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; details: string } | null>(null);

  const selected = attestations.find(a => a.id === selectedId);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setVerifyResult(null);
    onSelectAttestation(id);
  };

  const handleVerify = async (id: string) => {
    const result = await onVerifyAttestation(id);
    setVerifyResult(result);
  };

  const formatDate = (iso: string): string => {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const renderItem = ({ item }: { item: Attestation }) => (
    <TouchableOpacity
      style={[styles.attestationRow, selectedId === item.id && styles.attestationSelected]}
      onPress={() => handleSelect(item.id)}
      accessibilityRole="button"
    >
      <View style={styles.attestationContent}>
        <Text style={styles.attestationAction}>{item.actionType}</Text>
        <Text style={styles.attestationSummary} numberOfLines={1}>{item.summary}</Text>
        <Text style={styles.attestationDate}>{formatDate(item.timestamp)}</Text>
      </View>
      <View style={[
        styles.statusDot,
        { backgroundColor: item.signatureValid && item.chainValid ? colors.success : colors.attention },
      ]} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('screen.witness.title')}</Text>
        <Text style={styles.subtitle}>{t('screen.witness.subtitle')}</Text>
      </View>

      <FlatList
        data={attestations}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        style={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('screen.witness.empty')}</Text>
            <Text style={styles.emptySubtext}>
              Attestations appear when Semblance takes actions on your behalf.
            </Text>
          </View>
        }
      />

      {/* Detail Bottom Sheet */}
      {selected && (
        <View style={styles.detailSheet}>
          <View style={styles.detailHandle} />
          <Text style={styles.detailAction}>{selected.actionType}</Text>
          <Text style={styles.detailSummary}>{selected.summary}</Text>
          <Text style={styles.detailDate}>{formatDate(selected.timestamp)}</Text>

          <View style={styles.verifyRow}>
            <Text style={styles.verifyLabel}>{t('screen.witness.signature')}</Text>
            <Text style={[styles.verifyStatus, { color: selected.signatureValid ? colors.success : colors.attention }]}>
              {selected.signatureValid ? 'Valid' : 'Invalid'}
            </Text>
          </View>
          <View style={styles.verifyRow}>
            <Text style={styles.verifyLabel}>{t('screen.witness.chain')}</Text>
            <Text style={[styles.verifyStatus, { color: selected.chainValid ? colors.success : colors.attention }]}>
              {selected.chainValid ? 'Valid' : 'Broken'}
            </Text>
          </View>

          {verifyResult && (
            <View style={[styles.verifyBanner, { backgroundColor: verifyResult.valid ? colors.successSubtle : colors.attentionSubtle }]}>
              <Text style={styles.verifyBannerText}>{verifyResult.details}</Text>
            </View>
          )}

          <View style={styles.detailActions}>
            <TouchableOpacity
              style={styles.detailButton}
              onPress={() => handleVerify(selected.id)}
            >
              <Text style={styles.detailButtonText}>{t('button.verify')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.detailButton}
              onPress={() => onShareAttestation(selected.id)}
            >
              <Text style={styles.detailButtonText}>{t('button.share')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: { padding: spacing.base, paddingBottom: spacing.sm },
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
  },
  list: { flex: 1 },
  attestationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  attestationSelected: { backgroundColor: colors.surface2Dark },
  attestationContent: { flex: 1 },
  attestationAction: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  attestationSummary: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    marginTop: 2,
  },
  attestationDate: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  emptyState: { padding: spacing['2xl'], alignItems: 'center' },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  emptySubtext: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  detailSheet: {
    backgroundColor: colors.surface1Dark,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  detailHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderDark,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  detailAction: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  detailSummary: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    marginTop: spacing.xs,
  },
  detailDate: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  verifyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  verifyLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  verifyStatus: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  verifyBanner: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  verifyBannerText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
  },
  detailActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  detailButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  detailButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
  },
});
