import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PrivacyBadgeProps, PrivacyStatus } from './PrivacyBadge.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const statusColors: Record<PrivacyStatus, string> = {
  active: brandColors.veridian,
  syncing: brandColors.amber,
  offline: brandColors.silver,
};

export function PrivacyBadge({ status = 'active' }: PrivacyBadgeProps) {
  const { t } = useTranslation('privacy');
  const statusLabel = status === 'active' ? t('badge.active') : t(`badge.${status}`);
  return (
    <View
      style={styles.container}
      accessibilityRole="none"
      accessibilityLabel={t('badge.status_label', { status: statusLabel })}
    >
      <View style={[styles.dot, { backgroundColor: statusColors[status] }]} />
      <Text style={styles.label}>{statusLabel}</Text>
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
