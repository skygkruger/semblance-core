// UpgradeEmailCapture — Collects email for Stripe checkout flow (React Native).
//
// "No account required -- ever. We just need an address to send your license key."
// Email is held in memory only for the duration of the Stripe flow.
// Not persisted anywhere in the app.

import { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import type { UpgradeEmailCaptureProps } from './UpgradeEmailCapture.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UpgradeEmailCapture({ onSubmit, loading = false }: UpgradeEmailCaptureProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const isValid = EMAIL_REGEX.test(email.trim());
  const showError = touched && email.trim().length > 0 && !isValid;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    onSubmit(email.trim());
  };

  return (
    <View style={styles.container}>
      <Text style={styles.notice}>
        {t('upgrade.email_notice', {
          defaultValue: "No account required \u2014 ever. We just need an address to send your license key.",
        })}
      </Text>
      <View style={styles.form}>
        <TextInput
          style={[styles.input, showError && styles.inputError]}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (!touched) setTouched(true);
          }}
          placeholder="you@example.com"
          placeholderTextColor={brandColors.sv1}
          editable={!loading}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          accessibilityLabel={t('a11y.email_address', { defaultValue: 'Email address' })}
        />
        <Button
          variant="solid"
          size="md"
          onPress={handleSubmit}
          disabled={loading || !email.trim()}
        >
          {loading
            ? t('button.loading', { defaultValue: 'Loading...' })
            : t('button.continue', { defaultValue: 'Continue' })}
        </Button>
      </View>
      {showError && (
        <Text style={styles.errorText}>
          {t('validation.email_invalid', { defaultValue: 'Please enter a valid email address' })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: nativeSpacing.s4,
  },
  notice: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  form: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s3,
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
  },
  inputError: {
    borderColor: brandColors.critical,
  },
  errorText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.critical,
    marginTop: -nativeSpacing.s2,
  },
});
