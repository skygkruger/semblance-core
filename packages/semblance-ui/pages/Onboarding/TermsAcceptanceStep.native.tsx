// TermsAcceptanceStep — Final onboarding step (React Native).
//
// User sees the product work first, understands what they're agreeing to.
// No legal friction before the emotional arc.
// First run only, never shown again.

import { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import type { TermsAcceptanceStepProps } from './TermsAcceptanceStep.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export function TermsAcceptanceStep({ onAccept, termsVersion = '1.0' }: TermsAcceptanceStepProps) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {t('onboarding.terms.title', { defaultValue: 'One last thing' })}
      </Text>

      <Text style={styles.description}>
        {t('onboarding.terms.description', {
          defaultValue: "Semblance stores everything on your device. We don't collect your data, track your usage, or send anything to a server. Here's what you're agreeing to:",
        })}
      </Text>

      <ScrollView style={styles.termsBox} contentContainerStyle={styles.termsContent}>
        <Text style={styles.sectionTitle}>
          {t('onboarding.terms.local_heading', { defaultValue: 'Local-Only Processing' })}
        </Text>
        <Text style={styles.sectionBody}>
          {t('onboarding.terms.local_body', {
            defaultValue: 'All inference runs on your device. Your data never leaves your machine. We cannot access, read, or recover your data.',
          })}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: nativeSpacing.s3 }]}>
          {t('onboarding.terms.no_telemetry_heading', { defaultValue: 'Zero Telemetry' })}
        </Text>
        <Text style={styles.sectionBody}>
          {t('onboarding.terms.no_telemetry_body', {
            defaultValue: 'No analytics, no crash reporting, no usage tracking. The app contains no code that phones home.',
          })}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: nativeSpacing.s3 }]}>
          {t('onboarding.terms.license_heading', { defaultValue: 'License Terms' })}
        </Text>
        <Text style={styles.sectionBody}>
          {t('onboarding.terms.license_body', {
            defaultValue: 'Semblance is licensed for personal use. The free tier includes all core features. Premium features require a license key delivered via email.',
          })}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: nativeSpacing.s3 }]}>
          {t('onboarding.terms.your_data_heading', { defaultValue: 'Your Data, Your Rules' })}
        </Text>
        <Text style={styles.sectionBody}>
          {t('onboarding.terms.your_data_body', {
            defaultValue: 'You can export or delete all your data at any time. Disconnecting a service removes all associated data from the knowledge graph.',
          })}
        </Text>
      </ScrollView>

      <Pressable style={styles.checkboxRow} onPress={() => setChecked(!checked)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkmark}>{'\u2713'}</Text>}
        </View>
        <Text style={styles.checkboxLabel}>
          {t('onboarding.terms.checkbox', {
            defaultValue: 'I understand and accept these terms',
          })}
        </Text>
      </Pressable>

      <Button
        variant="solid"
        size="md"
        disabled={!checked}
        onPress={onAccept}
      >
        {t('onboarding.terms.accept_button', { defaultValue: 'Get started' })}
      </Button>

      <Text style={styles.versionLabel}>
        {t('onboarding.terms.version_label', { defaultValue: 'Terms version' })} {termsVersion}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: nativeSpacing.s5,
    paddingTop: nativeSpacing.s6,
    paddingBottom: nativeSpacing.s4,
    gap: nativeSpacing.s4,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
  },
  description: {
    fontSize: nativeFontSize.base,
    lineHeight: 22,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.ui,
  },
  termsBox: {
    maxHeight: 260,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: nativeRadius.lg,
  },
  termsContent: {
    padding: nativeSpacing.s4,
  },
  sectionTitle: {
    fontSize: nativeFontSize.sm,
    fontWeight: '600',
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
    marginBottom: 4,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.mono,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: brandColors.sv1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: brandColors.veridian,
    borderColor: brandColors.veridian,
  },
  checkmark: {
    fontSize: 14,
    color: brandColors.base,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
  },
  versionLabel: {
    fontSize: 11,
    color: brandColors.sv1,
    fontFamily: nativeFontFamily.mono,
    textAlign: 'center',
  },
});
