import { View, Text, StyleSheet } from 'react-native';
import type { AlterEgoReceiptProps } from './AlterEgoReceipt.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function AlterEgoReceipt({ summary }: AlterEgoReceiptProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.summary}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brandColors.s1,
    borderLeftWidth: 3,
    borderLeftColor: brandColors.veridian,
    borderRadius: nativeRadius.lg,
    padding: nativeSpacing.s4,
  },
  summary: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '500',
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    lineHeight: 20,
  },
});
