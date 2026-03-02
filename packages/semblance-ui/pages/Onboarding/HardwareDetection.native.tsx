import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import type { HardwareDetectionProps } from './HardwareDetection.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

function formatRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function HardwareDetection({ hardwareInfo, detecting, onContinue }: HardwareDetectionProps) {
  const { t } = useTranslation('onboarding');

  function tierLabel(tier: string): string {
    if (tier === 'capable') return t('hardware.tier_capable');
    if (tier === 'standard') return t('hardware.tier_standard');
    return t('hardware.tier_constrained');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{t('hardware.headline')}</Text>
      <Text style={styles.subtext}>
        {t('hardware.subtext')}
      </Text>

      {detecting && (
        <View style={styles.progressWrap}>
          <ProgressBar indeterminate />
        </View>
      )}

      {hardwareInfo && !detecting && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('hardware.tier_label')}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>{tierLabel(hardwareInfo.tier)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('hardware.ram_label')}</Text>
            <Text style={styles.value}>{formatRam(hardwareInfo.totalRamMb)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('hardware.cpu_label')}</Text>
            <Text style={styles.value}>{t('hardware.cpu_cores', { count: hardwareInfo.cpuCores })}</Text>
          </View>
          {hardwareInfo.gpuName && (
            <View style={styles.row}>
              <Text style={styles.label}>{t('hardware.gpu_label')}</Text>
              <Text style={styles.value}>
                {hardwareInfo.gpuName}
                {hardwareInfo.gpuVramMb ? ` (${formatRam(hardwareInfo.gpuVramMb)})` : ''}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>{t('hardware.os_label')}</Text>
            <Text style={styles.value}>{hardwareInfo.os} ({hardwareInfo.arch})</Text>
          </View>
        </View>
      )}

      {hardwareInfo && !detecting && (
        <Button variant="approve" onPress={onContinue}>{t('hardware.continue_button')}</Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s6,
    paddingHorizontal: nativeSpacing.s5,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 360,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 320,
  },
  card: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s5,
    width: '100%',
    maxWidth: 400,
    gap: nativeSpacing.s3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  value: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
  },
  tierBadge: {
    backgroundColor: 'rgba(110,207,163,0.1)',
    borderRadius: nativeRadius.sm,
    paddingHorizontal: nativeSpacing.s2,
    paddingVertical: 2,
  },
  tierText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
});
