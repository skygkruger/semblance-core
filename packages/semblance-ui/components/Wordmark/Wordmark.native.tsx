import { Text, StyleSheet } from 'react-native';
import type { WordmarkProps, WordmarkSize } from './Wordmark.types';
import { brandColors, nativeFontFamily } from '../../tokens/native';

const sizeMap: Record<WordmarkSize, number> = {
  nav: 15,
  hero: 38,
  footer: 13,
};

// letter-spacing: 0.14em — proportional to font size
const letterSpacingMap: Record<WordmarkSize, number> = {
  nav: 2.1,
  hero: 5.32,
  footer: 1.82,
};

const colorMap: Record<WordmarkSize, string> = {
  nav: brandColors.text,
  hero: brandColors.text,
  footer: brandColors.sv3,
};

export function Wordmark({ size = 'nav' }: WordmarkProps) {
  return (
    <Text
      style={[
        styles.text,
        { fontSize: sizeMap[size], letterSpacing: letterSpacingMap[size], color: colorMap[size], lineHeight: sizeMap[size] },
      ]}
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
    // lineHeight set inline per-size (line-height: 1 = fontSize)
  },
});
