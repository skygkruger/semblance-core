// BiometricSetupScreen — Mobile interface for biometric authentication setup.
// Enrollment status, enable/disable, test auth, fallback configuration.
// Uses BiometricAuthManager from packages/core/ via props.
// CRITICAL: No networking imports. Authentication is entirely local.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';
import type { BiometricType, LockTimeout } from '@semblance/core/auth/types';

export interface BiometricSetupScreenProps {
  isAvailable: boolean;
  isEnabled: boolean;
  biometricType: BiometricType;
  lockTimeout: LockTimeout;
  sensitiveReconfirm: boolean;
  onToggleEnabled: (enabled: boolean) => Promise<boolean>;
  onChangeLockTimeout: (timeout: LockTimeout) => void;
  onToggleSensitiveReconfirm: (enabled: boolean) => void;
  onTestAuth: () => Promise<{ success: boolean; error?: string }>;
}

const TIMEOUT_OPTIONS: { value: LockTimeout; label: string }[] = [
  { value: 'immediate', label: 'Immediately' },
  { value: '1min', label: '1 minute' },
  { value: '5min', label: '5 minutes' },
  { value: '15min', label: '15 minutes' },
  { value: 'never', label: 'Never' },
];

const BIOMETRIC_LABELS: Record<BiometricType, string> = {
  'face-id': 'Face ID',
  'touch-id': 'Touch ID',
  'fingerprint': 'Fingerprint',
  'windows-hello': 'Windows Hello',
  'pin': 'PIN',
  'none': 'Not available',
};

export const BiometricSetupScreen: React.FC<BiometricSetupScreenProps> = ({
  isAvailable,
  isEnabled,
  biometricType,
  lockTimeout,
  sensitiveReconfirm,
  onToggleEnabled,
  onChangeLockTimeout,
  onToggleSensitiveReconfirm,
  onTestAuth,
}) => {
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleToggle = async () => {
    const success = await onToggleEnabled(!isEnabled);
    if (!success && !isEnabled) {
      Alert.alert('Unavailable', 'Biometric hardware not available or not enrolled.');
    }
  };

  const handleTest = async () => {
    const result = await onTestAuth();
    setTestResult(result);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Biometric Security</Text>
      <Text style={styles.subtitle}>
        Protect your Semblance data with device biometrics.
      </Text>

      {/* Status Card */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Available</Text>
          <Text style={[styles.statusValue, { color: isAvailable ? colors.success : colors.attention }]}>
            {isAvailable ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Type</Text>
          <Text style={styles.statusValue}>{BIOMETRIC_LABELS[biometricType]}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={[styles.statusValue, { color: isEnabled ? colors.success : colors.textTertiary }]}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      {/* Enable/Disable */}
      <TouchableOpacity
        style={[styles.toggleButton, isEnabled ? styles.disableButton : styles.enableButton]}
        onPress={handleToggle}
      >
        <Text style={styles.toggleButtonText}>
          {isEnabled ? 'Disable Biometric Lock' : 'Enable Biometric Lock'}
        </Text>
      </TouchableOpacity>

      {/* Lock Timeout */}
      {isEnabled && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lock Timeout</Text>
          <Text style={styles.cardDescription}>
            How long before the app requires re-authentication.
          </Text>
          {TIMEOUT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={styles.optionRow}
              onPress={() => onChangeLockTimeout(opt.value)}
            >
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Text style={styles.optionCheck}>
                {lockTimeout === opt.value ? '[*]' : '[ ]'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Sensitive Action Reconfirm */}
      {isEnabled && (
        <TouchableOpacity
          style={styles.card}
          onPress={() => onToggleSensitiveReconfirm(!sensitiveReconfirm)}
        >
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>Sensitive Action Reconfirm</Text>
              <Text style={styles.cardDescription}>
                Always require biometric for exports, inheritance, and key changes.
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: sensitiveReconfirm ? colors.success : colors.textTertiary }]}>
              {sensitiveReconfirm ? 'On' : 'Off'}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Test Auth */}
      <TouchableOpacity style={styles.testButton} onPress={handleTest}>
        <Text style={styles.testButtonText}>Test Authentication</Text>
      </TouchableOpacity>

      {testResult && (
        <View style={[styles.testBanner, {
          backgroundColor: testResult.success ? colors.successSubtle : colors.attentionSubtle,
        }]}>
          <Text style={styles.testBannerText}>
            {testResult.success ? 'Authentication successful' : `Failed: ${testResult.error ?? 'unknown'}`}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.base,
  },
  cardTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  cardDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statusLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  statusValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  toggleButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.base,
  },
  enableButton: { backgroundColor: colors.primary },
  disableButton: { backgroundColor: colors.surface2Dark, borderWidth: 1, borderColor: colors.borderDark },
  toggleButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  optionLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  optionCheck: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  testButton: {
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  testButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  testBanner: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  testBannerText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    textAlign: 'center',
  },
});
