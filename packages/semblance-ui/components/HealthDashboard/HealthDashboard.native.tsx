import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { brandColors, nativeSpacing } from '../../tokens/native';
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
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Health Tracking</Text>
        <View style={styles.skeleton} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Health Tracking</Text>
      <Text style={styles.subtitle}>Your wellness patterns, privately tracked</Text>

      <QuickEntryCard
        todayEntry={todayEntry}
        symptomsHistory={symptomsHistory}
        medicationsHistory={medicationsHistory}
        onSave={onSaveEntry}
      />

      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Patterns ({insights.length})</Text>
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
  container: { flex: 1 },
  content: { padding: nativeSpacing.sp5, gap: nativeSpacing.sp5 },
  title: { fontFamily: 'Fraunces-Regular', fontSize: 21, color: brandColors.white },
  subtitle: { fontFamily: 'DMSans-Regular', fontSize: 13, color: brandColors.silver2 },
  section: { gap: nativeSpacing.sp3 },
  sectionTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: brandColors.silver3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insightCard: {
    backgroundColor: brandColors.surface1,
    borderRadius: 12,
    padding: nativeSpacing.sp4,
    gap: nativeSpacing.sp2,
  },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  insightTitle: { fontFamily: 'DMSans-Medium', fontSize: 13, color: brandColors.whiteDim },
  insightConf: { fontFamily: 'DMMono-Regular', fontSize: 11, color: brandColors.silver2 },
  insightDesc: { fontFamily: 'DMSans-Regular', fontSize: 11, color: brandColors.silver2 },
  disclaimer: {
    backgroundColor: brandColors.surface2,
    borderTopWidth: 1,
    borderTopColor: brandColors.border1,
    padding: nativeSpacing.sp3,
    borderRadius: 12,
  },
  disclaimerText: { fontFamily: 'DMMono-Regular', fontSize: 11, color: brandColors.silver1, lineHeight: 18 },
  skeleton: {
    height: 16,
    backgroundColor: brandColors.surface2,
    borderRadius: 4,
    width: '80%',
  },
});
