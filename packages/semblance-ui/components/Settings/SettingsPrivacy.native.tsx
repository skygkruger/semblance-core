import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet } from 'react-native';
import { BackArrow, ShieldCheck, ShieldAlert } from './SettingsIcons';
import type { SettingsPrivacyProps } from './SettingsPrivacy.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function SettingsPrivacy({
  lastAuditTime,
  auditStatus,
  dataSources,
  onRunAudit,
  onExportData,
  onExportHistory,
  onDeleteSourceData,
  onDeleteAllData,
  onResetSemblance,
  onBack,
}: SettingsPrivacyProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const auditClean = auditStatus === 'clean';
  const neverRun = auditStatus === 'never-run';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel={tc('a11y.go_back')}>
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>{t('privacy.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Privacy Status Card */}
        <View style={{ paddingTop: nativeSpacing.s4 }}>
          <View style={[
            styles.card,
            auditClean && styles.cardActive,
            !auditClean && !neverRun && styles.cardAmber,
          ]}>
            <View style={styles.cardStatusRow}>
              {auditClean ? <ShieldCheck color="#6ECFA3" /> : <ShieldAlert color="#C9A85C" />}
              <View style={[
                styles.badge,
                auditClean ? styles.badgeVeridian : neverRun ? styles.badgeMuted : styles.badgeAmber,
              ]}>
                <Text style={[
                  styles.badgeText,
                  auditClean ? styles.badgeTextVeridian : neverRun ? styles.badgeTextMuted : styles.badgeTextAmber,
                ]}>
                  {auditClean ? t('privacy.audit_badge_pass') : neverRun ? t('privacy.audit_badge_never_run') : t('privacy.audit_badge_review_needed')}
                </Text>
              </View>
            </View>
            <Text style={styles.cardSubtext}>
              {lastAuditTime ? t('privacy.audit_last_run', { time: lastAuditTime }) : t('privacy.audit_never_run')}
            </Text>
            <Pressable
              onPress={onRunAudit}
              style={({ pressed }) => [styles.ghostButton, pressed && styles.ghostButtonPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.ghostButtonText}>{t('privacy.btn_run_audit')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Data Sources */}
        {dataSources.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>{t('privacy.section_data_sources')}</Text>
            {dataSources.map((source) => (
              <View key={source.id} style={styles.row}>
                <Text style={styles.rowLabel}>{source.name}</Text>
                <Text style={styles.rowValue}>
                  {t('privacy.data_source_items', { n: source.entityCount, date: source.lastIndexed })}
                </Text>
                <Pressable
                  onPress={() => onDeleteSourceData(source.id)}
                  style={styles.removeButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.removeButtonText}>{t('privacy.btn_remove_source')}</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {/* Export & Portability */}
        <Text style={styles.sectionHeader}>{t('privacy.section_export')}</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onExportData}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>{t('privacy.btn_export_data')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={onExportHistory}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>{t('privacy.btn_export_history')}</Text>
        </Pressable>

        {/* Danger Zone */}
        <Text style={[styles.sectionHeader, styles.sectionHeaderDanger]}>{t('privacy.section_danger')}</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setShowDeleteAll(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.rowLabel, styles.dangerLabel]}>{t('privacy.btn_delete_all')}</Text>
        </Pressable>

        {showDeleteAll && (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmText}>{t('privacy.delete_confirm_prompt')}</Text>
            <View style={styles.confirmRow}>
              <TextInput
                style={styles.confirmInput}
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                placeholder={t('privacy.delete_confirm_placeholder')}
                placeholderTextColor={brandColors.sv1}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => {
                  if (deleteConfirm === 'delete') {
                    onDeleteAllData();
                    setShowDeleteAll(false);
                    setDeleteConfirm('');
                  }
                }}
                style={styles.confirmButton}
                accessibilityRole="button"
              >
                <Text style={[styles.confirmButtonText, { color: deleteConfirm === 'delete' ? brandColors.rust : brandColors.sv1 }]}>
                  {t('privacy.btn_confirm')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowDeleteAll(false); setDeleteConfirm(''); }}
                style={styles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>{t('privacy.btn_cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => setShowReset(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.rowLabel, styles.dangerLabel]}>{t('privacy.btn_reset_semblance')}</Text>
        </Pressable>

        {showReset && (
          <View style={styles.confirmContainer}>
            <Text style={styles.confirmText}>
              {t('privacy.reset_confirm_body')}
            </Text>
            <View style={styles.confirmRow}>
              <Pressable
                onPress={() => { onResetSemblance(); setShowReset(false); }}
                style={styles.destructiveButton}
                accessibilityRole="button"
              >
                <Text style={styles.destructiveButtonText}>{t('privacy.btn_reset_everything')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowReset(false)}
                style={styles.cancelButton}
                accessibilityRole="button"
              >
                <Text style={styles.cancelButtonText}>{t('privacy.btn_cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: nativeSpacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
    fontSize: 16,
    color: brandColors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: nativeSpacing.s8,
  },
  sectionHeader: {
    paddingTop: nativeSpacing.s5,
    paddingBottom: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.xs,
    fontWeight: '400',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: brandColors.sv1,
    fontFamily: nativeFontFamily.mono,
  },
  sectionHeaderDanger: {
    color: brandColors.rust,
  },
  card: {
    marginHorizontal: nativeSpacing.s4,
    padding: nativeSpacing.s4,
    backgroundColor: brandColors.s2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: nativeRadius.lg,
  },
  cardActive: {
    borderColor: 'rgba(110, 207, 163, 0.4)',
    backgroundColor: brandColors.s1,
  },
  cardAmber: {
    borderColor: 'rgba(201, 168, 92, 0.4)',
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    marginBottom: nativeSpacing.s2,
  },
  cardSubtext: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    marginBottom: nativeSpacing.s3,
  },
  badge: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeVeridian: {
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
  },
  badgeAmber: {
    backgroundColor: 'rgba(201, 168, 92, 0.1)',
  },
  badgeMuted: {
    backgroundColor: 'rgba(133, 147, 164, 0.1)',
  },
  badgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  badgeTextVeridian: {
    color: brandColors.veridian,
  },
  badgeTextAmber: {
    color: brandColors.amber,
  },
  badgeTextMuted: {
    color: brandColors.sv2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  rowLabel: {
    flex: 1,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.mono,
    marginRight: nativeSpacing.s2,
  },
  dangerLabel: {
    color: brandColors.rust,
  },
  removeButton: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  removeButtonText: {
    color: brandColors.rust,
    fontSize: 12,
    fontFamily: nativeFontFamily.mono,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.3)',
    borderRadius: nativeRadius.md,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s4,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButtonPressed: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
  },
  ghostButtonText: {
    color: brandColors.veridian,
    fontFamily: nativeFontFamily.ui,
    fontSize: 14,
    fontWeight: '400',
  },
  confirmContainer: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
  },
  confirmText: {
    fontSize: nativeFontSize.sm,
    color: brandColors.rust,
    marginBottom: nativeSpacing.s2,
  },
  confirmRow: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    alignItems: 'center',
  },
  confirmInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: nativeRadius.sm,
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: 6,
    fontSize: nativeFontSize.base,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.white,
    minHeight: 44,
  },
  confirmButton: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: nativeFontSize.sm,
  },
  cancelButton: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: nativeSpacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: brandColors.sv2,
    fontSize: nativeFontSize.sm,
  },
  destructiveButton: {
    backgroundColor: brandColors.rust,
    borderRadius: nativeRadius.sm,
    paddingVertical: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s4,
    minHeight: 44,
    justifyContent: 'center',
  },
  destructiveButtonText: {
    color: brandColors.base,
    fontSize: nativeFontSize.sm,
    fontWeight: '500',
  },
});
