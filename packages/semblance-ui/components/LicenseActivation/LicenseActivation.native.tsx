import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '../Button/Button';
import type { LicenseActivationProps } from './LicenseActivation.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function LicenseActivation({ onActivate, alreadyActive }: LicenseActivationProps) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;

    setStatus('validating');
    setErrorMessage('');

    const result = await onActivate(trimmed);

    if (result.success) {
      setStatus('success');
      setKey('');
    } else {
      setStatus('error');
      setErrorMessage(result.error ?? 'Activation failed');
    }
  };

  if (alreadyActive) {
    return (
      <View style={styles.activeContainer}>
        <View style={styles.statusRow}>
          <Text style={styles.checkMark}>{'\u2713'}</Text>
          <Text style={styles.activeText}>{t('license.active')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          value={key}
          onChangeText={(text) => {
            setKey(text);
            if (status === 'error') setStatus('idle');
          }}
          placeholder="sem_..."
          placeholderTextColor={brandColors.sv1}
          editable={status !== 'validating'}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('a11y.license_key')}
        />
        <Button
          variant="solid"
          size="sm"
          onPress={handleSubmit}
          disabled={!key.trim() || status === 'validating'}
        >
          {status === 'validating' ? t('license.activating') : t('button.activate')}
        </Button>
      </View>

      {status === 'success' && (
        <View style={styles.statusRow}>
          <Text style={[styles.checkMark, { color: brandColors.veridian }]}>{'\u2713'}</Text>
          <Text style={styles.successText}>{t('license.activated_success')}</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.statusRow}>
          <Text style={[styles.checkMark, { color: brandColors.rust }]}>{'\u2717'}</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: nativeSpacing.s3,
  },
  activeContainer: {
    gap: nativeSpacing.s2,
  },
  form: {
    flexDirection: 'row',
    gap: nativeSpacing.s2,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s3,
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  checkMark: {
    fontSize: 14,
    color: brandColors.veridian,
  },
  activeText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  successText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  errorText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.rust,
  },
});
