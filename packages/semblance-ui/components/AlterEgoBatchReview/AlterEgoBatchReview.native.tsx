import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AlterEgoBatchReviewProps } from './AlterEgoBatchReview.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function AlterEgoBatchReview({ items }: AlterEgoBatchReviewProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screen.alter_ego.batch_title')}</Text>
      <Text style={styles.count}>{items.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brandColors.base,
    padding: nativeSpacing.s4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    fontWeight: '500',
    color: brandColors.white,
    marginBottom: nativeSpacing.s2,
  },
  count: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
  },
});
