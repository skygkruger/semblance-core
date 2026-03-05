import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import type { NamingYourAIProps } from './NamingYourAI.types';
import { OpalBorderView } from '../../components/OpalBorderView/OpalBorderView.native';
import { ShimmerText } from '../../components/ShimmerText/ShimmerText.native';
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

        <View style={styles.headlineRow}>
          <Text style={styles.headline}>What will you call </Text>
          <ShimmerText
            fontSize={nativeFontSize.xl}
            fontFamily={nativeFontFamily.displayItalic}
            gradient="opal"
          >
            it
          </ShimmerText>
          <Text style={styles.headline}>?</Text>
        </View>

        <OpalBorderView borderRadius={nativeRadius.xl} style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder={t('naming_ai.placeholder')}
            placeholderTextColor={brandColors.sv1}
            value={aiName}
            onChangeText={setAiName}
            autoCapitalize="words"
            autoCorrect={false}
          />
        </OpalBorderView>

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
            variant="opal"
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
  headlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  headline: {
    fontFamily: nativeFontFamily.mono,
    fontWeight: '200',
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    letterSpacing: 0.5,
    lineHeight: 35,
  },
  inputWrap: {
    width: '100%',
  },
  input: {
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: 14,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    textAlign: 'center',
    minHeight: 48,
  },
  preview: {
    opacity: 0.3,
  },
  previewVisible: {
    opacity: 1,
  },
  previewText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 36,
    color: brandColors.sv2,
    textAlign: 'center',
    letterSpacing: 2.16,
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
