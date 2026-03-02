// CaptureScreen — Quick capture interface for mobile.
// Large text input, submit, recent captures. Time-referenced captures
// auto-create reminders (wired in Commit 9).

import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

export interface CaptureEntry {
  id: string;
  text: string;
  timestamp: string;
  linkedContext?: string;
  hasReminder?: boolean;
}

interface CaptureScreenProps {
  captures?: CaptureEntry[];
  onSubmit?: (text: string) => void;
}

export function CaptureScreen({ captures = [], onSubmit }: CaptureScreenProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setText('');
  }, [text, onSubmit]);

  return (
    <View style={styles.container}>
      <View style={styles.inputSection}>
        <Text style={styles.label}>{t('screen.capture.title')}</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('placeholder.capture_thought')}
          placeholderTextColor={colors.textTertiary}
          multiline
          autoFocus={false}
          textAlignVertical="top"
        />
        <TouchableOpacity
          style={[styles.submitButton, !text.trim() && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.save_capture')}
        >
          <Text style={styles.submitButtonText}>{t('button.capture')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>{t('screen.capture.section_recent')}</Text>
        <FlatList
          data={captures}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.captureCard}>
              <Text style={styles.captureText} numberOfLines={2}>{item.text}</Text>
              <View style={styles.captureFooter}>
                <Text style={styles.captureTime}>{item.timestamp}</Text>
                {item.hasReminder && (
                  <Text style={styles.reminderBadge}>{t('screen.capture.reminder_badge')}</Text>
                )}
                {item.linkedContext && (
                  <Text style={styles.contextLink}>{item.linkedContext}</Text>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('screen.capture.empty')}</Text>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  inputSection: {
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  label: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.md,
    color: colors.textPrimaryDark,
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    padding: spacing.base,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderDark,
    marginBottom: spacing.md,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  recentSection: {
    flex: 1,
    padding: spacing.base,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  captureCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  captureText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    marginBottom: spacing.sm,
  },
  captureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  captureTime: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  reminderBadge: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.accent,
  },
  contextLink: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.primary,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing['2xl'],
  },
});
