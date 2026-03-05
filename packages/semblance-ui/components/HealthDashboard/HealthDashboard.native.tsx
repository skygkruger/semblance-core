import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandColors, nativeSpacing, nativeSurfaces, nativeSurfaceIdentity, nativeFontFamily, nativeFontSize } from '../../tokens/native';
import { QuickEntryCard } from './QuickEntryCard.native';
import type { HealthDashboardProps } from './HealthDashboard.types';

export function HealthDashboard({
  todayEntry,
  trends,
  insights,
  symptomsHistory,
  medicationsHistory,
  hasHealthKit,
  onSaveEntry,
  onDismissInsight,
  loading,
}: HealthDashboardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('healthDashboard.title')}</Text>
        <View style={styles.skeleton} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('healthDashboard.title')}</Text>
      <Text style={styles.subtitle}>{t('healthDashboard.subtitle')}</Text>

      <QuickEntryCard
        todayEntry={todayEntry}
        symptomsHistory={symptomsHistory}
        medicationsHistory={medicationsHistory}
        onSave={onSaveEntry}
      />

      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('healthDashboard.patterns', { count: insights.length })}</Text>
          {insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightConf}>{Math.round(insight.confidence * 100)}%</Text>
              </View>
              <Text style={styles.insightDesc}>{insight.description}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          Semblance identifies statistical patterns in your data. This is not medical advice,
          diagnosis, or treatment. Correlations are observations, not causation. Always consult
          a healthcare professional for medical decisions.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E11' },
  content: { padding: nativeSpacing.s5, gap: nativeSpacing.s5, borderWidth: 1, borderColor: nativeSurfaceIdentity.health.borderColor, borderRadius: 12 },
  title: { fontFamily: nativeFontFamily.display, fontSize: 21, fontWeight: '300', color: brandColors.white },
  subtitle: { fontFamily: nativeFontFamily.ui, fontSize: nativeFontSize.sm, color: brandColors.sv2 },
  section: { gap: nativeSpacing.s3 },
  sectionTitle: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightCard: {
    backgroundColor: brandColors.s1,
    borderRadius: 12,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s2,
  },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  insightTitle: { fontFamily: nativeFontFamily.uiMedium, fontSize: nativeFontSize.sm, color: brandColors.wDim },
  insightConf: { fontFamily: nativeFontFamily.mono, fontSize: nativeFontSize.xs, color: brandColors.sv2 },
  insightDesc: { fontFamily: nativeFontFamily.ui, fontSize: nativeFontSize.xs, color: brandColors.sv2 },
  disclaimer: {
    backgroundColor: brandColors.s2,
    borderTopWidth: 1,
    borderTopColor: brandColors.b1,
    padding: nativeSpacing.s3,
    borderRadius: 12,
  },
  disclaimerText: { fontFamily: nativeFontFamily.mono, fontSize: nativeFontSize.xs, color: brandColors.sv1, lineHeight: 18 },
  skeleton: {
    height: 16,
    backgroundColor: brandColors.s2,
    borderRadius: 4,
    width: '80%',
  },
});
