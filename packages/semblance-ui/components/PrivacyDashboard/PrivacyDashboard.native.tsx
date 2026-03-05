import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { ActionLogItem } from '../ActionLogItem/ActionLogItem';
import { Button } from '../Button/Button.native';
import type { PrivacyDashboardProps } from './PrivacyDashboard.types';
import { OpalBorderView } from '../OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, nativeSurfaces, nativeSurfaceIdentity } from '../../tokens/native';

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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Privacy Dashboard</Text>
        <Text style={styles.headerSubtitle}>ZERO KNOWLEDGE VERIFIED</Text>
      </View>

      {/* Comparison Statement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('dashboard.section_comparison')}</Text>
        <View style={styles.statsGrid}>
          <OpalBorderView borderRadius={nativeRadius.md} style={styles.statWrap}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{dataSources}</Text>
              <Text style={styles.statLabel}>{t('dashboard.stat_data_sources')}</Text>
            </View>
          </OpalBorderView>
          <OpalBorderView borderRadius={nativeRadius.md} style={styles.statWrap}>
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
          </OpalBorderView>
          <OpalBorderView borderRadius={nativeRadius.md} style={styles.statWrap}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{actionsLogged}</Text>
              <Text style={styles.statLabel}>{t('dashboard.stat_actions_logged')}</Text>
            </View>
          </OpalBorderView>
          <OpalBorderView borderRadius={nativeRadius.md} style={styles.statWrap}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{timeSavedHours}h</Text>
              <Text style={styles.statLabel}>{t('dashboard.stat_time_saved')}</Text>
            </View>
          </OpalBorderView>
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
                <Button variant="opal" size="sm" onPress={onExportReceipt}>{t('dashboard.chain_integrity.export_receipt')}</Button>
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
          <OpalBorderView borderRadius={nativeRadius.md}>
            <View style={styles.proof}>
              <View style={styles.proofIcon}>
                <Text style={styles.proofIconText}>{'\u26E8'}</Text>
              </View>
              <Text style={styles.proofText}>
                Zero unauthorized network connections verified
              </Text>
            </View>
          </OpalBorderView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: nativeSurfaces.void.backgroundColor,
  },
  content: {
    padding: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s12,
    gap: nativeSpacing.s8,
    borderWidth: nativeSurfaces.void.borderWidth,
    borderColor: nativeSurfaceIdentity.privacy.borderColor,
    borderRadius: nativeSurfaces.void.borderRadius,
  },
  section: {
    gap: nativeSpacing.s4,
  },
  sectionTitle: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.slate3,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: nativeSpacing.s4,
  },
  statWrap: {
    minWidth: 140,
    flex: 1,
  },
  stat: {
    padding: nativeSpacing.s4,
    alignItems: 'center',
    gap: nativeSpacing.s1,
  },
  statValue: {
    fontFamily: nativeFontFamily.display,
    fontWeight: '300',
    fontSize: nativeFontSize['2xl'],
    color: brandColors.white,
  },
  statValueVeridian: {
    color: brandColors.veridian,
  },
  statLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  divider: {
    height: 1,
    backgroundColor: brandColors.veridian,
    maxWidth: 72,
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
    backgroundColor: 'rgba(176, 154, 138, 0.08)',
    borderColor: 'rgba(176, 154, 138, 0.15)',
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
    color: brandColors.caution,
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
  header: {
    gap: nativeSpacing.s1,
  },
  headerTitle: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
  },
  headerSubtitle: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
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
    fontSize: nativeFontSize.base,
    color: brandColors.sv3,
  },
  networkValue: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  networkValueZero: {
    color: brandColors.veridian,
  },
  proof: {
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
    color: brandColors.sv3,
  },
});
