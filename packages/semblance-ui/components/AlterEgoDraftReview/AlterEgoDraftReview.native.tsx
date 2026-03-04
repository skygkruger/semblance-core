import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AlterEgoDraftReviewProps } from './AlterEgoDraftReview.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function AlterEgoDraftReview({ contactEmail, body }: AlterEgoDraftReviewProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('screen.alter_ego.draft_title')}</Text>
      <Text style={styles.to}>{contactEmail}</Text>
      <Text style={styles.body} numberOfLines={5}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brandColors.s1,
    borderLeftWidth: 3,
    borderLeftColor: brandColors.veridian,
    borderRadius: 12,
    padding: nativeSpacing.s4,
    gap: nativeSpacing.s2,
  },
  label: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  to: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
  },
  body: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
});
