// LivingWillScreen — Mobile interface for Living Will (encrypted digital twin export).
// Shows export status, configure settings, manual export → share sheet, import → file picker.
// Premium-gated feature — business logic in packages/core/.
// CRITICAL: No networking imports. Export/import is local file operations only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface LivingWillExportStatus {
  lastExportAt: string | null;
  lastExportSizeBytes: number | null;
  autoExportEnabled: boolean;
  exportFormat: 'json-ld' | 'sqlite-bundle';
}

export interface LivingWillScreenProps {
  exportStatus: LivingWillExportStatus;
  isPremium: boolean;
  onExport: () => Promise<void>;
  onImport: () => Promise<void>;
  onToggleAutoExport: (enabled: boolean) => void;
  onConfigureFormat: (format: 'json-ld' | 'sqlite-bundle') => void;
}

export const LivingWillScreen: React.FC<LivingWillScreenProps> = ({
  exportStatus,
  isPremium,
  onExport,
  onImport,
  onToggleAutoExport,
  onConfigureFormat,
}) => {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Living Will export requires Semblance Premium.');
      return;
    }
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Living Will import requires Semblance Premium.');
      return;
    }
    await onImport();
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatSize = (bytes: number | null): string => {
    if (bytes === null) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('screen.living_will.title')}</Text>
      <Text style={styles.subtitle}>
        Your encrypted digital twin — a complete, portable export of your Semblance data.
      </Text>

      {/* Export Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('screen.living_will.export_status')}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.living_will.last_export')}</Text>
          <Text style={styles.statusValue}>{formatDate(exportStatus.lastExportAt)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.living_will.size')}</Text>
          <Text style={styles.statusValue}>{formatSize(exportStatus.lastExportSizeBytes)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.living_will.format')}</Text>
          <Text style={styles.statusValue}>{exportStatus.exportFormat}</Text>
        </View>
      </View>

      {/* Actions */}
      <TouchableOpacity
        style={[styles.primaryButton, exporting && styles.buttonDisabled]}
        onPress={handleExport}
        disabled={exporting}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.export_living_will')}
      >
        <Text style={styles.primaryButtonText}>
          {exporting ? 'Exporting...' : 'Export Now'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={handleImport}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.import_living_will')}
      >
        <Text style={styles.secondaryButtonText}>{t('screen.living_will.import_file')}</Text>
      </TouchableOpacity>

      {/* Settings */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('screen.living_will.settings_title')}</Text>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => onToggleAutoExport(!exportStatus.autoExportEnabled)}
        >
          <Text style={styles.settingLabel}>{t('screen.living_will.auto_export')}</Text>
          <Text style={styles.settingValue}>
            {exportStatus.autoExportEnabled ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => {
            const next = exportStatus.exportFormat === 'json-ld' ? 'sqlite-bundle' : 'json-ld';
            onConfigureFormat(next);
          }}
        >
          <Text style={styles.settingLabel}>{t('screen.living_will.export_format')}</Text>
          <Text style={styles.settingValue}>{exportStatus.exportFormat}</Text>
        </TouchableOpacity>
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
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  cardTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  statusLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textTertiary,
  },
  statusValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  secondaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  settingLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  settingValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
});
