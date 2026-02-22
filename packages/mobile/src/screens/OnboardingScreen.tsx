// OnboardingScreen — Mobile onboarding flow adapted from desktop Step 9.
// 1. Naming → 2. Hardware detection → 3. Model download consent → 4. Download progress
// → 5. First inference test → 6. Data connection → 7. Knowledge Moment.
// Screen flow wired in Commit 8.

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

export type OnboardingStep =
  | 'naming'
  | 'hardware'
  | 'download-consent'
  | 'downloading'
  | 'first-inference'
  | 'data-connection'
  | 'knowledge-moment'
  | 'complete';

interface OnboardingScreenProps {
  step?: OnboardingStep;
  deviceTier?: string;
  modelName?: string;
  modelSize?: string;
  downloadProgress?: number;
  onNameSubmit?: (name: string) => void;
  onConsent?: () => void;
  onSkip?: () => void;
  onComplete?: () => void;
}

export function OnboardingScreen({
  step = 'naming',
  deviceTier = 'capable',
  modelName = 'Llama 3.2 3B',
  modelSize = '1.8 GB',
  downloadProgress = 0,
  onNameSubmit,
  onConsent,
  onSkip,
  onComplete,
}: OnboardingScreenProps) {
  const [name, setName] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Step 1: Naming */}
        {step === 'naming' && (
          <>
            <Text style={styles.heading}>Welcome to Semblance</Text>
            <Text style={styles.tagline}>Your Intelligence. Your Device. Your Rules.</Text>
            <Text style={styles.body}>What should Semblance call you?</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.primaryButton, !name.trim() && styles.buttonDisabled]}
              onPress={() => onNameSubmit?.(name.trim())}
              disabled={!name.trim()}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Step 2: Hardware Detection */}
        {step === 'hardware' && (
          <>
            <Text style={styles.heading}>Device Assessment</Text>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Device Tier</Text>
              <Text style={styles.infoValue}>{deviceTier}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Recommended Model</Text>
              <Text style={styles.infoValue}>{modelName}</Text>
            </View>
            <Text style={styles.body}>
              {deviceTier === 'none'
                ? 'Your device can connect to Semblance on your computer for AI features.'
                : `Your device can run ${modelName} locally for on-device inference.`}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onConsent}>
              <Text style={styles.primaryButtonText}>
                {deviceTier === 'none' ? 'Skip AI Download' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Step 3: Download Consent */}
        {step === 'download-consent' && (
          <>
            <Text style={styles.heading}>Download AI Model</Text>
            <Text style={styles.body}>
              Download {modelSize} AI model over WiFi? This model runs entirely on your device.
              No cloud. No servers. Just you.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onConsent}>
              <Text style={styles.primaryButtonText}>Download {modelSize} over WiFi</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={onSkip}>
              <Text style={styles.secondaryButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Step 4: Downloading */}
        {step === 'downloading' && (
          <>
            <Text style={styles.heading}>Downloading Model</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${downloadProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{downloadProgress}% complete</Text>
            <Text style={styles.body}>
              This may take a few minutes. You can use the app once complete.
            </Text>
          </>
        )}

        {/* Step 5: First Inference */}
        {step === 'first-inference' && (
          <>
            <Text style={styles.heading}>Model Ready</Text>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.xl }} />
            <Text style={styles.body}>Running first inference test...</Text>
          </>
        )}

        {/* Step 6: Knowledge Moment */}
        {step === 'knowledge-moment' && (
          <>
            <Text style={styles.heading}>Your AI is Ready</Text>
            <Text style={styles.body}>
              Semblance is running locally on your device. Connect your email and calendar
              to unlock its full potential.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={onComplete}>
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Complete */}
        {step === 'complete' && (
          <>
            <Text style={styles.heading}>All Set</Text>
            <Text style={styles.body}>
              Semblance is ready. Everything runs on your device.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
  },
  content: {
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  heading: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size['2xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimaryDark,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  tagline: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.md,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  body: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
    marginBottom: spacing.xl,
    maxWidth: 320,
  },
  input: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.lg,
    color: colors.textPrimaryDark,
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    width: '100%',
    maxWidth: 320,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.borderDark,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  secondaryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
  },
  secondaryButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  infoCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.md,
    padding: spacing.base,
    width: '100%',
    maxWidth: 320,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  infoLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  infoValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  progressBar: {
    width: '100%',
    maxWidth: 320,
    height: 8,
    backgroundColor: colors.surface2Dark,
    borderRadius: 4,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
    marginBottom: spacing.xl,
  },
});
