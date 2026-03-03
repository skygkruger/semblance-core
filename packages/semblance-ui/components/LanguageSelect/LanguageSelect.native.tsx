import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import type { LanguageSelectProps } from './LanguageSelect.types';
import { SUPPORTED_LANGUAGES, findLanguage } from '../../../core/i18n/supported-languages';
import type { SupportedLanguage } from '../../../core/i18n/supported-languages';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const CONTINUE_LABELS: Record<string, string> = {
  en: 'Continue',
  es: 'Continuar',
  de: 'Weiter',
  pt: 'Continuar',
  fr: 'Continuer',
  ja: '続ける',
  'zh-CN': '继续',
  'zh-TW': '繼續',
  ko: '계속',
  it: 'Continua',
};

export function LanguageSelect({ detectedCode, onConfirm }: LanguageSelectProps) {
  const initial = findLanguage(detectedCode);
  const [selected, setSelected] = useState(initial.code);

  const handleConfirm = useCallback(() => {
    onConfirm(selected);
  }, [selected, onConfirm]);

  const renderItem = useCallback(({ item }: { item: SupportedLanguage }) => {
    const isSelected = item.code === selected;
    return (
      <Pressable
        style={[styles.option, isSelected && styles.optionSelected]}
        onPress={() => setSelected(item.code)}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
      >
        <Text
          style={[
            styles.nativeName,
            isSelected && styles.nativeNameSelected,
            item.fontStack ? { fontFamily: undefined } : undefined,
          ]}
        >
          {item.nativeName}
        </Text>
      </Pressable>
    );
  }, [selected]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{'Choose your language'}</Text>

      <FlatList
        data={SUPPORTED_LANGUAGES}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        style={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        style={styles.button}
        onPress={handleConfirm}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>
          {CONTINUE_LABELS[selected] ?? 'Continue'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    gap: nativeSpacing.s8,
    maxWidth: 420,
    width: '100%',
  },
  heading: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  list: {
    width: '100%',
    maxHeight: 400,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: nativeSpacing.s4,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    borderRadius: nativeRadius.md,
  },
  optionSelected: {
    backgroundColor: brandColors.s1,
    borderLeftColor: brandColors.veridian,
  },
  nativeName: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.md,
    color: brandColors.sv2,
  },
  nativeNameSelected: {
    fontFamily: nativeFontFamily.uiMedium,
    color: brandColors.white,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: nativeRadius.xl,
    backgroundColor: brandColors.veridian,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.base,
    color: brandColors.base,
  },
});
