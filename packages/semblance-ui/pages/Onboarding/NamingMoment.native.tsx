import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { LogoMark } from '../../components/LogoMark/LogoMark';
import { Button } from '../../components/Button/Button';
import type { NamingMomentProps } from './NamingMoment.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function NamingMoment({ onComplete, defaultValue = '' }: NamingMomentProps) {
  const { t } = useTranslation('onboarding');
  const [userName, setUserName] = useState(defaultValue);
  const hasValue = userName.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <LogoMark size={64} />

        <Text style={styles.headline}>
          {t('naming_moment.headline')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('naming_moment.placeholder')}
          placeholderTextColor={brandColors.sv1}
          value={userName}
          onChangeText={setUserName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {hasValue && (
          <Text style={styles.subtext}>
            {t('naming_moment.confirmation', { name: userName.trim() })}
          </Text>
        )}

        <View style={styles.btnWrap}>
          <Button
            variant="approve"
            size="lg"
            disabled={!hasValue}
            onPress={() => onComplete?.(userName.trim())}
          >
            {t('naming_moment.continue_button')}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
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
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
  },
  btnWrap: {
    marginTop: nativeSpacing.s2,
  },
});
