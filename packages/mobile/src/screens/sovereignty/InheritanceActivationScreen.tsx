// InheritanceActivationScreen — Mobile interface for activating an .inheritance file.
// File picker → passphrase entry → activation flow.
// Premium-gated feature — business logic in packages/core/.
// CRITICAL: No networking imports. Activation is local-only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface ActivationResult {
  success: boolean;
  sectionsActivated: string[];
  warnings: string[];
  error?: string;
}

export interface InheritanceActivationScreenProps {
  isPremium: boolean;
  onPickFile: () => Promise<{ uri: string; name: string } | null>;
  onActivate: (fileUri: string, passphrase: string) => Promise<ActivationResult>;
}

type ActivationStep = 'select-file' | 'enter-passphrase' | 'activating' | 'result';

export const InheritanceActivationScreen: React.FC<InheritanceActivationScreenProps> = ({
  isPremium,
  onPickFile,
  onActivate,
}) => {
  const [step, setStep] = useState<ActivationStep>('select-file');
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [result, setResult] = useState<ActivationResult | null>(null);

  const handlePickFile = async () => {
    if (!isPremium) {
      Alert.alert('Premium Feature', 'Inheritance activation requires Semblance Premium.');
      return;
    }
    const file = await onPickFile();
    if (file) {
      setSelectedFile(file);
      setStep('enter-passphrase');
    }
  };

  const handleActivate = async () => {
    if (!selectedFile || !passphrase) return;
    setStep('activating');
    const activationResult = await onActivate(selectedFile.uri, passphrase);
    setResult(activationResult);
    setStep('result');
  };

  const handleReset = () => {
    setStep('select-file');
    setSelectedFile(null);
    setPassphrase('');
    setResult(null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Inheritance Activation</Text>
      <Text style={styles.subtitle}>
        Activate an inheritance file received from a trusted party.
      </Text>

      {/* Step 1: Select File */}
      {step === 'select-file' && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.stepTitle}>Select Inheritance File</Text>
          <Text style={styles.stepDescription}>
            Choose a .inheritance file from your device.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile}>
            <Text style={styles.primaryButtonText}>Choose File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2: Enter Passphrase */}
      {step === 'enter-passphrase' && selectedFile && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.stepTitle}>Enter Passphrase</Text>
          <View style={styles.fileInfo}>
            <Text style={styles.fileLabel}>File:</Text>
            <Text style={styles.fileName}>{selectedFile.name}</Text>
          </View>
          <TextInput
            style={styles.passphraseInput}
            placeholder="Passphrase provided by the account holder"
            placeholderTextColor={colors.textTertiary}
            value={passphrase}
            onChangeText={setPassphrase}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="Inheritance passphrase"
          />
          <TouchableOpacity
            style={[styles.primaryButton, !passphrase && styles.buttonDisabled]}
            onPress={handleActivate}
            disabled={!passphrase}
          >
            <Text style={styles.primaryButtonText}>Activate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 3: Activating */}
      {step === 'activating' && (
        <View style={styles.stepCard}>
          <Text style={styles.stepLabel}>Step 3 of 3</Text>
          <Text style={styles.stepTitle}>Activating...</Text>
          <Text style={styles.stepDescription}>
            Decrypting and verifying inheritance data. This may take a moment.
          </Text>
        </View>
      )}

      {/* Result */}
      {step === 'result' && result && (
        <View style={styles.stepCard}>
          <Text style={[styles.resultTitle, { color: result.success ? colors.success : colors.attention }]}>
            {result.success ? 'Activation Successful' : 'Activation Failed'}
          </Text>

          {result.success && (
            <>
              <Text style={styles.resultText}>
                {result.sectionsActivated.length} section(s) activated:
              </Text>
              {result.sectionsActivated.map(s => (
                <Text key={s} style={styles.resultItem}>  {s}</Text>
              ))}
            </>
          )}

          {result.error && (
            <Text style={styles.errorText}>{result.error}</Text>
          )}

          {result.warnings.length > 0 && (
            <View style={styles.warningsBox}>
              <Text style={styles.warningsTitle}>Warnings:</Text>
              {result.warnings.map((w, i) => (
                <Text key={i} style={styles.warningText}>{w}</Text>
              ))}
            </View>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
            <Text style={styles.secondaryButtonText}>Done</Text>
          </TouchableOpacity>
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
  stepCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
  },
  stepLabel: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  stepTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  stepDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.base,
  },
  fileInfo: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  fileLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginRight: spacing.xs,
  },
  fileName: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    flex: 1,
  },
  passphraseInput: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.base,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  resultTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.md,
  },
  resultText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xs,
  },
  resultItem: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: 2,
  },
  errorText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.attention,
    marginBottom: spacing.md,
  },
  warningsBox: {
    backgroundColor: colors.surface2Dark,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  warningsTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  warningText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: 2,
  },
});
