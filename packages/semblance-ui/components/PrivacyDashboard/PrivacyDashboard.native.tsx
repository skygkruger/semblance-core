import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { ActionLogItem } from '../ActionLogItem/ActionLogItem';
import type { PrivacyDashboardProps } from './PrivacyDashboard.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

export function PrivacyDashboard({
  dataSources = 0,
  cloudConnections = 0,
  actionsLogged = 0,
  timeSavedHours = 0,
  networkEntries = [],
  auditEntries = [],
  proofVerified = false,
  chainIntegrity,
  keySecurity,
  onExportReceipt,
}: PrivacyDashboardProps) {
  const { t } = useTranslation('privacy');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Comparison Statement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dashboard.section_comparison')}</Text>
        <View style={styles.statsGrid}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{dataSources}</Text>
            <Text style={styles.statLabel}>{t('dashboard.stat_data_sources')}</Text>
          </View>
          <View style={styles.stat}>
            <Text
              style={[
                styles.statValue,
                cloudConnections === 0 && styles.statValueVeridian,
              ]}
            >
              {cloudConnections}
            </Text>
            <Text style={styles.statLabel}>{t('dashboard.stat_cloud_connections')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{actionsLogged}</Text>
            <Text style={styles.statLabel}>{t('dashboard.stat_actions_logged')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{timeSavedHours}h</Text>
            <Text style={styles.statLabel}>{t('dashboard.stat_time_saved')}</Text>
          </View>
        </View>
        <View style={styles.divider} />
      </View>

      {/* Chain Integrity */}
      {chainIntegrity && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.section_chain_integrity')}</Text>
          {chainIntegrity.loading ? (
            <Text style={styles.loadingText}>{t('dashboard.chain_integrity.loading')}</Text>
          ) : (
            <>
              <View style={[
                styles.statusBadge,
                chainIntegrity.verified ? styles.statusBadgeVerified : styles.statusBadgeWarning,
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  chainIntegrity.verified ? styles.statusBadgeTextVerified : styles.statusBadgeTextWarning,
                ]}>
                  {chainIntegrity.verified
                    ? t('dashboard.chain_integrity.verified')
                    : t('dashboard.chain_integrity.break_detected', { date: chainIntegrity.firstBreak ?? '' })}
                </Text>
              </View>
              <View style={styles.chainStats}>
                <Text style={styles.chainStat}>
                  {t('dashboard.chain_integrity.entries', { count: chainIntegrity.entryCount })}
                </Text>
                <Text style={styles.chainStat}>
                  {t('dashboard.chain_integrity.days', { count: chainIntegrity.daysVerified })}
                </Text>
              </View>
              {onExportReceipt && (
                <Pressable style={styles.exportBtn} onPress={onExportReceipt}>
                  <Text style={styles.exportBtnText}>{t('dashboard.chain_integrity.export_receipt')}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      {/* Key Security */}
      {keySecurity && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.section_key_security')}</Text>
          {keySecurity.loading ? (
            <Text style={styles.loadingText}>{t('dashboard.key_security.loading')}</Text>
          ) : (
            <>
              <View style={[
                styles.statusBadge,
                keySecurity.hardwareBacked ? styles.statusBadgeVerified : styles.statusBadgeNeutral,
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  keySecurity.hardwareBacked ? styles.statusBadgeTextVerified : styles.statusBadgeTextNeutral,
                ]}>
                  {keySecurity.hardwareBacked
                    ? t('dashboard.key_security.hardware_secured', { platform: keySecurity.backend })
                    : t('dashboard.key_security.software_secured', { platform: keySecurity.backend })}
                </Text>
              </View>
              {keySecurity.publicKeyFingerprint && (
                <View style={styles.keyFingerprint}>
                  <Text style={styles.networkLabel}>{t('dashboard.key_security.fingerprint')}</Text>
                  <Text style={styles.keyValue}>{keySecurity.publicKeyFingerprint}</Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      {/* Network Activity */}
      {networkEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.section_network_activity')}</Text>
          {networkEntries.map((entry, i) => (
            <View key={i} style={styles.networkRow}>
              <Text style={styles.networkLabel}>{entry.label}</Text>
              <Text
                style={[
                  styles.networkValue,
                  entry.isZero === true && styles.networkValueZero,
                ]}
              >
                {entry.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Audit Trail */}
      {auditEntries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.section_audit_trail')}</Text>
          {auditEntries.map((entry, i) => (
            <ActionLogItem
              key={i}
              status={entry.status}
              text={entry.text}
              domain={entry.domain}
              timestamp={entry.timestamp}
            />
          ))}
        </View>
      )}

      {/* Proof of Privacy */}
      {proofVerified && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dashboard.proof_of_privacy.title')}</Text>
          <View style={styles.proof}>
            <View style={styles.proofIcon}>
              <Text style={styles.proofIconText}>{'\u26E8'}</Text>
            </View>
            <Text style={styles.proofText}>
              Zero unauthorized network connections verified
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  content: {
    padding: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s12,
    gap: nativeSpacing.s6,
  },
  section: {
    gap: nativeSpacing.s3,
  },
  sectionTitle: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s4,
  },
  stat: {
    ...opalSurface,
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s4,
    minWidth: 140,
    flex: 1,
    alignItems: 'center',
    gap: nativeSpacing.s1,
  },
  statValue: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
  },
  statValueVeridian: {
    color: brandColors.veridian,
  },
  statLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.b2,
    marginTop: nativeSpacing.s2,
  },
  loadingText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
    fontStyle: 'italic',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.sm,
    borderWidth: 1,
  },
  statusBadgeVerified: {
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
    borderColor: 'rgba(110, 207, 163, 0.15)',
  },
  statusBadgeWarning: {
    backgroundColor: 'rgba(201, 168, 92, 0.08)',
    borderColor: 'rgba(201, 168, 92, 0.15)',
  },
  statusBadgeNeutral: {
    backgroundColor: 'rgba(133, 147, 164, 0.08)',
    borderColor: 'rgba(133, 147, 164, 0.15)',
  },
  statusBadgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  statusBadgeTextVerified: {
    color: brandColors.veridian,
  },
  statusBadgeTextWarning: {
    color: brandColors.amber,
  },
  statusBadgeTextNeutral: {
    color: brandColors.silver,
  },
  chainStats: {
    flexDirection: 'row',
    gap: nativeSpacing.s4,
  },
  chainStat: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
  },
  exportBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.15)',
    borderRadius: nativeRadius.sm,
  },
  exportBtnText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
  keyFingerprint: {
    gap: nativeSpacing.s1,
  },
  keyValue: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv2,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: nativeSpacing.s2,
    borderBottomWidth: 1,
    borderBottomColor: brandColors.b1,
  },
  networkLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
  networkValue: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
  },
  networkValueZero: {
    color: brandColors.veridian,
  },
  proof: {
    ...opalSurface,
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  proofIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proofIconText: {
    fontSize: 16,
    color: brandColors.veridian,
  },
  proofText: {
    flex: 1,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
});
