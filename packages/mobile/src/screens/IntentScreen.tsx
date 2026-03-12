// IntentScreen — Mobile intent management: primary goal, hard limits, core values.
// Persists all data to AsyncStorage for local-only storage.
//
// CRITICAL: No network imports. All data is local.

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

const STORAGE_KEYS = {
  goal: 'semblance.intent.goal',
  limit: 'semblance.intent.limit',
  value: 'semblance.intent.value',
} as const;

export function IntentScreen() {
  const { t } = useTranslation();

  const [goal, setGoal] = useState('');
  const [limit, setLimit] = useState('');
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);

  // Load persisted values on mount
  useEffect(() => {
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const [savedGoal, savedLimit, savedValue] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.goal),
          AsyncStorage.getItem(STORAGE_KEYS.limit),
          AsyncStorage.getItem(STORAGE_KEYS.value),
        ]);
        if (savedGoal !== null) setGoal(savedGoal);
        if (savedLimit !== null) setLimit(savedLimit);
        if (savedValue !== null) setValue(savedValue);
      } catch {
        // AsyncStorage unavailable — fields stay at defaults
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.goal, goal),
        AsyncStorage.setItem(STORAGE_KEYS.limit, limit),
        AsyncStorage.setItem(STORAGE_KEYS.value, value),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Persist failure — silent, data still in state
    }
  }, [goal, limit, value]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.screenTitle}>{t('screen.intent.title')}</Text>
        <Text style={styles.subtitle}>
          Define what Semblance should prioritize, what it must never do, and what matters most to you.
        </Text>

        {/* Primary Goal */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('screen.intent.section_goal')}</Text>
          <TextInput
            style={styles.textArea}
            value={goal}
            onChangeText={setGoal}
            placeholder={t('screen.intent.placeholder_goal')}
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Hard Limits */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('screen.intent.section_limits')}</Text>
          <TextInput
            style={styles.textArea}
            value={limit}
            onChangeText={setLimit}
            placeholder={t('screen.intent.placeholder_limit')}
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Core Values */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t('screen.intent.section_values')}</Text>
          <TextInput
            style={styles.textArea}
            value={value}
            onChangeText={setValue}
            placeholder={t('screen.intent.placeholder_value')}
            placeholderTextColor={colors.textTertiary}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saved && styles.saveButtonSaved]}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.saveButtonText}>
            {saved ? 'Saved' : t('button.save')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  screenTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xl,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  textArea: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.lg,
    padding: spacing.base,
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    minHeight: 100,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.base,
  },
  saveButtonSaved: {
    backgroundColor: colors.success,
  },
  saveButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.bgDark,
  },
});
