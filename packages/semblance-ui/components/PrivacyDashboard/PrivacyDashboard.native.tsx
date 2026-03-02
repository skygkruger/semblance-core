import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
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
