import { View, Text, StyleSheet } from 'react-native';
import type { AlterEgoReceiptProps } from './AlterEgoReceipt.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

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
    borderRadius: 6,
    padding: nativeSpacing.s4,
  },
  summary: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    lineHeight: 20,
  },
});
