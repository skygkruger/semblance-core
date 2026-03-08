import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SovereigntyReportCardProps } from './SovereigntyReportCard.types';

function formatTimeSaved(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SovereigntyReportCard({
  periodStart,
  periodEnd,
  generatedAt,
  deviceId,
  knowledgeSummary,
  autonomousActions,
  hardLimitsEnforced,
  auditChainStatus,
  signatureVerified,
  publicKeyFingerprint,
  comparisonStatement,
  onExportPDF,
  loading = false,
}: SovereigntyReportCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: '#8593A4', fontSize: 14 }}>{t('sovereignty.loading', { defaultValue: 'Generating sovereignty report...' })}</Text>
      </View>
    );
  }

  const knowledgeTotal = Object.values(knowledgeSummary).reduce((a, b) => a + b, 0);
  const actionsTotal = Object.values(autonomousActions.byDomain).reduce((a, b) => a + b, 0);

  return (
    <ScrollView style={{ backgroundColor: '#0B0E11' }}>
      <View style={{ padding: 20 }}>
        {/* Header */}
        <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', letterSpacing: 1, textTransform: 'uppercase' }}>
          {periodStart} — {periodEnd}
        </Text>
        <Text style={{ fontFamily: 'Fraunces', fontSize: 24, color: '#EEF1F4', marginTop: 8 }}>
          {t('sovereignty.title', { defaultValue: 'Sovereignty Report' })}
        </Text>
        <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', marginTop: 4 }}>
          {t('sovereignty.generated', { defaultValue: 'Generated {{date}} · {{device}}', date: new Date(generatedAt).toLocaleString(), device: deviceId })}
        </Text>

        {/* Knowledge Summary */}
        <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
          {t('sovereignty.knowledge_summary', { defaultValue: 'Knowledge Summary' })}
        </Text>
        {Object.entries(knowledgeSummary).map(([key, value]) => (
          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{key}</Text>
            <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#8593A4' }}>{value}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 }}>
          <Text style={{ fontSize: 14, color: '#EEF1F4', fontWeight: '500' }}>{t('sovereignty.total', { defaultValue: 'Total' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#6ECFA3', fontWeight: '600' }}>{knowledgeTotal}</Text>
        </View>

        {/* Autonomous Actions */}
        <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
          {t('sovereignty.autonomous_actions', { defaultValue: 'Autonomous Actions' })}
        </Text>
        {Object.entries(autonomousActions.byDomain).map(([key, value]) => (
          <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
            <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{key}</Text>
            <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#8593A4' }}>{value}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 }}>
          <Text style={{ fontSize: 14, color: '#EEF1F4', fontWeight: '500' }}>{t('sovereignty.total_actions', { defaultValue: 'Total Actions' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#6ECFA3' }}>{actionsTotal}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: '#EEF1F4', fontWeight: '500' }}>{t('sovereignty.time_saved', { defaultValue: 'Time Saved' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#6ECFA3' }}>{formatTimeSaved(autonomousActions.totalTimeSavedSeconds)}</Text>
        </View>

        {/* Hard Limits */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 16 }}>
          <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{t('sovereignty.hard_limits', { defaultValue: 'Hard Limits Enforced' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#8593A4' }}>{hardLimitsEnforced}</Text>
        </View>

        {/* Audit Chain */}
        <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 12 }}>
          {t('sovereignty.audit_chain', { defaultValue: 'Audit Chain Status' })}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{t('sovereignty.status', { defaultValue: 'Status' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: auditChainStatus.verified ? '#6ECFA3' : '#B09A8A' }}>
            {auditChainStatus.verified ? t('sovereignty.verified', { defaultValue: 'Verified' }) : t('sovereignty.broken', { defaultValue: 'Broken' })}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{t('sovereignty.entries', { defaultValue: 'Entries' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#8593A4' }}>{auditChainStatus.totalEntries}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{t('sovereignty.days_covered', { defaultValue: 'Days Covered' })}</Text>
          <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: '#8593A4' }}>{auditChainStatus.daysCovered}</Text>
        </View>

        {/* Signature */}
        {signatureVerified !== undefined && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 8 }}>
            <Text style={{ fontSize: 14, color: '#CDD4DB' }}>{t('sovereignty.signature', { defaultValue: 'Signature' })}</Text>
            <Text style={{ fontFamily: 'DM Mono', fontSize: 14, color: signatureVerified ? '#6ECFA3' : '#B07A8A' }}>
              {signatureVerified ? t('sovereignty.valid', { defaultValue: 'Valid' }) : t('sovereignty.invalid', { defaultValue: 'Invalid' })}
            </Text>
          </View>
        )}
        {publicKeyFingerprint && (
          <Text style={{ fontFamily: 'DM Mono', fontSize: 11, color: '#5E6B7C', marginTop: 4 }}>
            {publicKeyFingerprint}
          </Text>
        )}

        {/* Comparison Statement */}
        {comparisonStatement && (
          <View style={{ marginTop: 24, padding: 16, borderWidth: 1, borderColor: 'rgba(110,207,163,0.2)', borderRadius: 8 }}>
            <Text style={{ fontSize: 13, color: '#A8B4C0', lineHeight: 20 }}>{comparisonStatement}</Text>
          </View>
        )}

        {/* Export Button */}
        {onExportPDF && (
          <Pressable
            onPress={onExportPDF}
            style={{ marginTop: 24, alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(110,207,163,0.3)', borderRadius: 8 }}
          >
            <Text style={{ fontSize: 14, color: '#6ECFA3' }}>{t('sovereignty.export_pdf', { defaultValue: 'Export PDF' })}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
