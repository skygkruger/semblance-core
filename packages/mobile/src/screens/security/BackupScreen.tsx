// BackupScreen — Mobile interface for encrypted backup management.
// Backup status, create → destination → passphrase, restore → file picker → passphrase, schedule.
// Uses BackupManager from packages/core/ via props.
// CRITICAL: No networking imports. No cloud backup. Local only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface BackupDestination {
  id: string;
  label: string;
  path: string;
  type: 'app-documents' | 'external-storage';
  availableBytes: number | null;
  isDefault: boolean;
}

export interface BackupHistoryItem {
  filePath: string;
  createdAt: string;
  sizeBytes: number;
  sectionCount: number;
}

export interface BackupScreenProps {
  destinations: BackupDestination[];
  history: BackupHistoryItem[];
  lastBackupAt: string | null;
  schedule: 'daily' | 'weekly' | 'manual';
  isBackingUp: boolean;
  isRestoring: boolean;
  onCreateBackup: (destinationId: string, passphrase: string) => Promise<{ success: boolean; error?: string }>;
  onRestoreBackup: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
  onPickRestoreFile: () => Promise<{ uri: string; name: string } | null>;
  onChangeSchedule: (schedule: 'daily' | 'weekly' | 'manual') => void;
}

type BackupMode = 'idle' | 'creating' | 'restoring';

export const BackupScreen: React.FC<BackupScreenProps> = ({
  destinations,
  history,
  lastBackupAt,
  schedule,
  isBackingUp,
  isRestoring,
  onCreateBackup,
  onRestoreBackup,
  onPickRestoreFile,
  onChangeSchedule,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<BackupMode>('idle');
  const [selectedDestination, setSelectedDestination] = useState<string>(
    destinations.find(d => d.isDefault)?.id ?? destinations[0]?.id ?? '',
  );
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [restoreFile, setRestoreFile] = useState<{ uri: string; name: string } | null>(null);
  const [restorePassphrase, setRestorePassphrase] = useState('');

  const handleCreate = async () => {
    if (!passphrase) {
      Alert.alert('Required', 'Enter a passphrase to encrypt your backup.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      Alert.alert('Mismatch', 'Passphrases do not match.');
      return;
    }
    const result = await onCreateBackup(selectedDestination, passphrase);
    if (result.success) {
      Alert.alert('Backup Created', 'Your encrypted backup was saved successfully.');
      setMode('idle');
      setPassphrase('');
      setConfirmPassphrase('');
    } else {
      Alert.alert('Backup Failed', result.error ?? 'Unknown error');
    }
  };

  const handlePickRestore = async () => {
    const file = await onPickRestoreFile();
    if (file) {
      setRestoreFile(file);
    }
  };

  const handleRestore = async () => {
    if (!restorePassphrase) {
      Alert.alert('Required', 'Enter the backup passphrase.');
      return;
    }
    const result = await onRestoreBackup(restorePassphrase);
    if (result.success) {
      Alert.alert('Restore Complete', 'Your data was restored successfully.');
      setMode('idle');
      setRestoreFile(null);
      setRestorePassphrase('');
    } else {
      Alert.alert('Restore Failed', result.error ?? 'Unknown error');
    }
  };

  const formatDate = (iso: string | null): string => {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('screen.backup.title')}</Text>
      <Text style={styles.subtitle}>
        Create encrypted backups of your Semblance data. Protected with Argon2id + AES-256-GCM.
      </Text>

      {/* Status */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.backup.last_backup')}</Text>
          <Text style={styles.statusValue}>{formatDate(lastBackupAt)}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.backup.schedule')}</Text>
          <Text style={styles.statusValue}>{schedule}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>{t('screen.backup.destinations')}</Text>
          <Text style={styles.statusValue}>{destinations.length} available</Text>
        </View>
      </View>

      {mode === 'idle' && (
        <>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setMode('creating')}
          >
            <Text style={styles.primaryButtonText}>{t('screen.backup.create_backup')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => { setMode('restoring'); handlePickRestore(); }}
          >
            <Text style={styles.secondaryButtonText}>{t('screen.backup.restore_from_backup')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Create Backup Flow */}
      {mode === 'creating' && (
        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>{t('screen.backup.create_title')}</Text>

          <Text style={styles.fieldLabel}>{t('screen.backup.destination')}</Text>
          {destinations.map(dest => (
            <TouchableOpacity
              key={dest.id}
              style={[styles.destOption, selectedDestination === dest.id && styles.destOptionActive]}
              onPress={() => setSelectedDestination(dest.id)}
            >
              <Text style={styles.destLabel}>{dest.label}</Text>
              {dest.availableBytes !== null && (
                <Text style={styles.destFree}>{formatBytes(dest.availableBytes)} free</Text>
              )}
            </TouchableOpacity>
          ))}

          <Text style={styles.fieldLabel}>{t('screen.backup.passphrase_label')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('placeholder.enter_passphrase')}
            placeholderTextColor={colors.textTertiary}
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            accessibilityLabel={t('a11y.backup_passphrase')}
          />
          <TextInput
            style={styles.input}
            placeholder={t('placeholder.confirm_passphrase')}
            placeholderTextColor={colors.textTertiary}
            value={confirmPassphrase}
            onChangeText={setConfirmPassphrase}
            secureTextEntry
            accessibilityLabel={t('a11y.confirm_backup_passphrase')}
          />

          <TouchableOpacity
            style={[styles.primaryButton, isBackingUp && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={isBackingUp}
          >
            <Text style={styles.primaryButtonText}>
              {isBackingUp ? 'Creating...' : t('screen.backup.create_backup')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => setMode('idle')}>
            <Text style={styles.cancelButtonText}>{t('button.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Restore Flow */}
      {mode === 'restoring' && (
        <View style={styles.flowCard}>
          <Text style={styles.flowTitle}>{t('screen.backup.restore_title')}</Text>

          {restoreFile ? (
            <>
              <View style={styles.fileInfo}>
                <Text style={styles.fileLabel}>{t('screen.backup.file_label')}</Text>
                <Text style={styles.fileName}>{restoreFile.name}</Text>
              </View>
              <Text style={styles.fieldLabel}>{t('screen.backup.passphrase_label')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('placeholder.backup_passphrase')}
                placeholderTextColor={colors.textTertiary}
                value={restorePassphrase}
                onChangeText={setRestorePassphrase}
                secureTextEntry
                accessibilityLabel={t('a11y.restore_passphrase')}
              />
              <TouchableOpacity
                style={[styles.primaryButton, isRestoring && styles.buttonDisabled]}
                onPress={handleRestore}
                disabled={isRestoring}
              >
                <Text style={styles.primaryButtonText}>
                  {isRestoring ? 'Restoring...' : 'Restore'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={handlePickRestore}>
              <Text style={styles.primaryButtonText}>{t('screen.backup.choose_backup_file')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cancelButton} onPress={() => setMode('idle')}>
            <Text style={styles.cancelButtonText}>{t('button.cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Schedule */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('screen.backup.schedule')}</Text>
        {(['daily', 'weekly', 'manual'] as const).map(opt => (
          <TouchableOpacity
            key={opt}
            style={styles.scheduleOption}
            onPress={() => onChangeSchedule(opt)}
          >
            <Text style={styles.scheduleLabel}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
            <Text style={styles.scheduleCheck}>
              {schedule === opt ? '[*]' : '[ ]'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* History */}
      {history.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('screen.backup.history')}</Text>
          {history.map((item, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
              <Text style={styles.historySize}>{formatBytes(item.sizeBytes)}</Text>
              <Text style={styles.historySections}>{item.sectionCount} sections</Text>
            </View>
          ))}
        </View>
      )}
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
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
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
  flowCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.xl,
  },
  flowTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  input: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  destOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    marginBottom: spacing.xs,
  },
  destOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtleDark,
  },
  destLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  destFree: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  fileInfo: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  fileLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginRight: spacing.xs,
  },
  fileName: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    flex: 1,
  },
  scheduleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  scheduleLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  scheduleCheck: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
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
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  historyDate: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    flex: 1,
  },
  historySize: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginRight: spacing.md,
  },
  historySections: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
});
