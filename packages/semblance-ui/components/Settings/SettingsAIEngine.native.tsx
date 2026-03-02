import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { BackArrow } from './SettingsIcons';
import type { SettingsAIEngineProps } from './SettingsAIEngine.types';
import { threadOptions, contextOptions, contextLabels } from './SettingsAIEngine.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.toggle, on && styles.toggleOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={[styles.toggleThumb, on && styles.toggleThumbOn]} />
    </Pressable>
  );
}

export function SettingsAIEngine({
  modelName,
  modelSize,
  hardwareProfile,
  isModelRunning,
  inferenceThreads,
  contextWindow,
  gpuAcceleration,
  customModelPath,
  onChange,
  onBack,
}: SettingsAIEngineProps) {
  const { t } = useTranslation('settings');
  const { t: tc } = useTranslation();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel={tc('a11y.go_back')}>
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>{t('ai_engine.title')}</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Active Model */}
        <Text style={styles.sectionHeader}>{t('ai_engine.section_model')}</Text>
        <View style={[styles.card, { marginBottom: nativeSpacing.s4 }]}>
          <View style={styles.cardRow}>
            <Text style={styles.monoLabel}>{modelName}</Text>
            <View style={[styles.badge, isModelRunning ? styles.badgeVeridian : styles.badgeMuted]}>
              <Text style={[styles.badgeText, isModelRunning ? styles.badgeTextVeridian : styles.badgeTextMuted]}>
                {isModelRunning ? t('ai_engine.badge_running') : t('ai_engine.badge_not_loaded')}
              </Text>
            </View>
          </View>
          <Text style={styles.monoSub}>{modelSize}</Text>
        </View>

        {/* Hardware Profile */}
        <Text style={styles.sectionHeader}>{t('ai_engine.section_hardware')}</Text>
        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>{hardwareProfile}</Text>
        </View>

        {/* Performance Settings */}
        <Text style={styles.sectionHeader}>{t('ai_engine.section_performance')}</Text>

        <View style={styles.segmentContainer}>
          <Text style={styles.segmentLabel}>{t('ai_engine.label_inference_threads')}</Text>
          <View style={styles.segment}>
            {threadOptions.map((opt) => {
              const isActive = String(inferenceThreads) === opt;
              return (
                <Pressable
                  key={opt}
                  style={[styles.segmentOption, isActive && styles.segmentOptionActive]}
                  onPress={() => onChange('inferenceThreads', opt === 'auto' ? 'auto' : Number(opt))}
                  accessibilityRole="button"
                >
                  <Text style={[styles.segmentOptionText, isActive && styles.segmentOptionTextActive]}>
                    {opt === 'auto' ? t('ai_engine.thread_option_auto') : opt}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.segmentContainer}>
          <Text style={styles.segmentLabel}>{t('ai_engine.label_context_window')}</Text>
          <View style={styles.segment}>
            {contextOptions.map((opt) => {
              const isActive = contextWindow === opt;
              return (
                <Pressable
                  key={opt}
                  style={[styles.segmentOption, isActive && styles.segmentOptionActive]}
                  onPress={() => onChange('contextWindow', opt)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.segmentOptionText, isActive && styles.segmentOptionTextActive]}>
                    {contextLabels[opt]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('gpuAcceleration', !gpuAcceleration)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>{t('ai_engine.label_gpu_acceleration')}</Text>
          <Toggle on={gpuAcceleration} onToggle={() => onChange('gpuAcceleration', !gpuAcceleration)} />
        </Pressable>

        {/* Advanced */}
        <Text style={styles.sectionHeader}>{t('ai_engine.section_advanced')}</Text>
        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>{t('ai_engine.label_custom_model_path')}</Text>
          <Text style={styles.rowValue}>{customModelPath || t('ai_engine.value_custom_model_none')}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('resetDefaults', true)}
          accessibilityRole="button"
        >
          <Text style={[styles.rowLabel, { color: brandColors.sv2 }]}>{t('ai_engine.btn_reset_defaults')}</Text>
        </Pressable>
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
  card: {
    marginHorizontal: nativeSpacing.s4,
    padding: nativeSpacing.s4,
    backgroundColor: brandColors.s2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: nativeRadius.lg,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: nativeSpacing.s1,
  },
  monoLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.base,
    fontWeight: '400',
    color: brandColors.white,
  },
  monoSub: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 12,
    fontWeight: '300',
    color: brandColors.sv3,
  },
  badge: {
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeVeridian: {
    backgroundColor: 'rgba(110, 207, 163, 0.1)',
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
  rowStatic: {
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
  segmentContainer: {
    paddingHorizontal: nativeSpacing.s5,
    paddingVertical: nativeSpacing.s3,
  },
  segmentLabel: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    marginBottom: nativeSpacing.s2,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: nativeRadius.md,
    padding: 2,
    gap: 2,
  },
  segmentOption: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: nativeSpacing.s3,
    borderRadius: nativeRadius.sm,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentOptionActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  segmentOptionText: {
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.mono,
    color: brandColors.sv3,
    textAlign: 'center',
  },
  segmentOptionTextActive: {
    color: brandColors.white,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: brandColors.veridian,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: brandColors.white,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
});
