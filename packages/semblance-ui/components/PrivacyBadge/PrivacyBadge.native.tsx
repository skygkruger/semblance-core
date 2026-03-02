import { View, Text, StyleSheet } from 'react-native';
import type { PrivacyBadgeProps, PrivacyStatus } from './PrivacyBadge.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const statusColors: Record<PrivacyStatus, string> = {
  active: brandColors.veridian,
  syncing: brandColors.amber,
  offline: brandColors.silver,
};

const statusLabels: Record<PrivacyStatus, string> = {
  active: 'Local Only',
  syncing: 'Syncing',
  offline: 'Offline',
};

export function PrivacyBadge({ status = 'active' }: PrivacyBadgeProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="none"
      accessibilityLabel={`Privacy status: ${statusLabels[status]}`}
    >
      <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
      <Text style={styles.label}>{statusLabels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: nativeFontSize.xs,
    fontFamily: nativeFontFamily.ui,
    color: brandColors.silver,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
