import { Text, StyleSheet } from 'react-native';
import type { WordmarkProps, WordmarkSize } from './Wordmark.types';
import { brandColors, nativeFontFamily } from '../../tokens/native';

const sizeMap: Record<WordmarkSize, number> = {
  nav: 18,
  hero: 38,
  footer: 14,
};

export function Wordmark({ size = 'nav' }: WordmarkProps) {
  return (
    <Text
      style={[styles.text, { fontSize: sizeMap[size] }]}
      accessibilityRole="header"
    >
      SEMBLANCE
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: nativeFontFamily.wordmark,
    color: brandColors.text,
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
});
