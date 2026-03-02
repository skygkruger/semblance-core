import { View, Text, StyleSheet } from 'react-native';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { Button } from '../../components/Button/Button';
import type { HardwareDetectionProps } from './HardwareDetection.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

function formatRam(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function tierLabel(tier: string): string {
  if (tier === 'capable') return 'High Performance';
  if (tier === 'standard') return 'Standard';
  return 'Constrained';
}

export function HardwareDetection({ hardwareInfo, detecting, onContinue }: HardwareDetectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Detecting your hardware...</Text>
      <Text style={styles.subtext}>
        Semblance will recommend the best model for your machine.
      </Text>

      {detecting && (
        <View style={styles.progressWrap}>
          <ProgressBar indeterminate />
        </View>
      )}

      {hardwareInfo && !detecting && (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Tier</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>{tierLabel(hardwareInfo.tier)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>RAM</Text>
            <Text style={styles.value}>{formatRam(hardwareInfo.totalRamMb)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>CPU</Text>
            <Text style={styles.value}>{hardwareInfo.cpuCores} cores</Text>
          </View>
          {hardwareInfo.gpuName && (
            <View style={styles.row}>
              <Text style={styles.label}>GPU</Text>
              <Text style={styles.value}>
                {hardwareInfo.gpuName}
                {hardwareInfo.gpuVramMb ? ` (${formatRam(hardwareInfo.gpuVramMb)})` : ''}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>OS</Text>
            <Text style={styles.value}>{hardwareInfo.os} ({hardwareInfo.arch})</Text>
          </View>
        </View>
      )}

      {hardwareInfo && !detecting && (
        <Button variant="approve" onPress={onContinue}>Continue</Button>
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
