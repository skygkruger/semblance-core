import { useTranslation } from 'react-i18next';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import type { ThemeMode, ThemeToggleProps } from './ThemeToggle.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const modes: Array<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel={t('a11y.theme_selection')}>
      {modes.map((mode) => {
        const isActive = mode.id === value;
        return (
          <Pressable
            key={mode.id}
            onPress={() => onChange(mode.id)}
            style={[styles.option, isActive && styles.optionActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: brandColors.s2,
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s1,
  },
  option: {
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.md,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionActive: {
    backgroundColor: brandColors.s1,
  },
  label: {
    fontSize: nativeFontSize.sm,
    fontFamily: nativeFontFamily.uiMedium,
    color: brandColors.silver,
  },
  labelActive: {
    color: brandColors.text,
  },
});
