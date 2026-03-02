import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import type { NamingYourAIProps } from './NamingYourAI.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function NamingYourAI({ onComplete, defaultValue = '' }: NamingYourAIProps) {
  const { t } = useTranslation('onboarding');
  const [aiName, setAiName] = useState(defaultValue);
  const hasValue = aiName.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <LogoMark size={80} />

        <Text style={styles.headline}>
          {t('naming_ai.headline')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('naming_ai.placeholder')}
          placeholderTextColor={brandColors.sv1}
          value={aiName}
          onChangeText={setAiName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <View style={[styles.preview, hasValue && styles.previewVisible]}>
          <Text style={styles.previewText}>{aiName || '\u00A0'}</Text>
        </View>

        {hasValue && (
          <Text style={styles.subtext}>
            {t('naming_ai.subtext')}
          </Text>
        )}

        <View style={styles.btnWrap}>
          <Button
            variant="approve"
            size="lg"
            disabled={!hasValue}
            onPress={() => onComplete?.(aiName.trim())}
          >
            {t('naming_ai.start_button')}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: nativeSpacing.s6,
    paddingHorizontal: nativeSpacing.s5,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  pronoun: {
    fontFamily: nativeFontFamily.displayItalic,
    color: brandColors.veridian,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
    textAlign: 'center',
  },
  preview: {
    opacity: 0.3,
  },
  previewVisible: {
    opacity: 1,
  },
  previewText: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize['2xl'],
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
  },
  btnWrap: {
    marginTop: nativeSpacing.s2,
  },
});
