// SearchSettingsScreen — Configure web search engine and optional Brave API key.
// Default: DuckDuckGo fallback (no key needed). Optional: Brave Search for better results.

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius, typographyPresets } from '../theme/tokens.js';

export type SearchEngineChoice = 'auto' | 'brave' | 'duckduckgo';

export interface SearchSettingsState {
  braveApiKey: string;
  searchEngine: SearchEngineChoice;
}

interface SearchSettingsScreenProps {
  settings: SearchSettingsState;
  onSettingsChange: (settings: SearchSettingsState) => void;
}

const ENGINE_OPTIONS: { value: SearchEngineChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'brave', label: 'Brave' },
  { value: 'duckduckgo', label: 'DuckDuckGo' },
];

export function SearchSettingsScreen({
  settings,
  onSettingsChange,
}: SearchSettingsScreenProps) {
  const { t } = useTranslation();

  const update = (partial: Partial<SearchSettingsState>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  const showApiKeyInput = settings.searchEngine === 'auto' || settings.searchEngine === 'brave';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {t('screen.search_settings.title', { defaultValue: 'Search' })}
      </Text>

      <Text style={styles.infoText}>
        {t('screen.search_settings.info', {
          defaultValue:
            'Search works automatically using DuckDuckGo. Add a Brave Search API key for improved results.',
        })}
      </Text>

      {/* Search engine selector */}
      <View style={styles.inputSection}>
        <Text style={styles.sectionLabel}>
          {t('screen.search_settings.engine_label', { defaultValue: 'SEARCH ENGINE' })}
        </Text>
        <View style={styles.engineRow}>
          {ENGINE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.engineOption,
                settings.searchEngine === option.value && styles.engineOptionActive,
              ]}
              onPress={() => update({ searchEngine: option.value })}
            >
              <Text
                style={[
                  styles.engineText,
                  settings.searchEngine === option.value && styles.engineTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.engineHint}>
          {settings.searchEngine === 'auto'
            ? t('screen.search_settings.hint_auto', {
                defaultValue: 'Uses Brave if API key is set, otherwise DuckDuckGo.',
              })
            : settings.searchEngine === 'brave'
              ? t('screen.search_settings.hint_brave', {
                  defaultValue: 'Requires a valid Brave Search API key.',
                })
              : t('screen.search_settings.hint_duckduckgo', {
                  defaultValue: 'Free, no API key required.',
                })}
        </Text>
      </View>

      {/* Brave API key input */}
      {showApiKeyInput && (
        <View style={styles.inputSection}>
          <Text style={styles.sectionLabel}>
            {t('screen.search_settings.api_key_label', { defaultValue: 'BRAVE API KEY' })}
          </Text>
          <TextInput
            style={styles.input}
            value={settings.braveApiKey}
            onChangeText={(text) => update({ braveApiKey: text })}
            placeholder={t('screen.search_settings.api_key_placeholder', {
              defaultValue: 'Enter your Brave Search API key',
            })}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.apiKeyHint}>
            {t('screen.search_settings.api_key_hint', {
              defaultValue:
                'Get a free API key at brave.com/search/api. Your key is stored locally and never sent to any server except Brave Search.',
            })}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.md },
  title: {
    ...typographyPresets.titleLg,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  infoText: {
    ...typographyPresets.bodySm,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  inputSection: { marginTop: spacing.sm },
  sectionLabel: {
    ...typographyPresets.bodyXs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  engineRow: { flexDirection: 'row', gap: spacing.xs },
  engineOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  engineOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  engineText: { ...typographyPresets.bodyXs, color: colors.textSecondary },
  engineTextActive: { color: colors.primary, fontWeight: '600' },
  engineHint: {
    ...typographyPresets.bodyXs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surface1,
  },
  apiKeyHint: {
    ...typographyPresets.bodyXs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
});
