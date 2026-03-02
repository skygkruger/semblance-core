/**
 * Import Digital Life Screen (Mobile) — Import external data sources.
 *
 * Shows import source cards with consent text, import button, and progress.
 * Non-premium users see "Available with Digital Representative".
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { styles } from './ImportDigitalLifeScreen.styles';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportSource {
  id: string;
  name: string;
  description: string;
  formats: string;
  consentText: string;
}

export interface ImportProgress {
  phase: string;
  itemsProcessed: number;
  totalItems: number;
  isActive: boolean;
}

interface ImportDigitalLifeScreenProps {
  isPremium?: boolean;
  importSources?: ImportSource[];
  progress?: ImportProgress | null;
  onImport?: (sourceId: string) => void;
}

// ─── Default Sources ────────────────────────────────────────────────────────

export const DEFAULT_IMPORT_SOURCES: ImportSource[] = [
  {
    id: 'browser_history',
    name: 'Browser History',
    description: 'Import browsing history from Chrome or Firefox',
    formats: 'Chrome JSON, Firefox SQLite',
    consentText: 'Browsing history will be indexed locally for search and context.',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Import from Obsidian or Apple Notes',
    formats: 'Markdown, Apple Notes HTML',
    consentText: 'Notes will be indexed locally. No content leaves your device.',
  },
  {
    id: 'photos_metadata',
    name: 'Photos Metadata',
    description: 'Import EXIF data from your photo library',
    formats: 'JPEG, PNG metadata only',
    consentText: 'Your photos themselves are never stored. Only metadata is indexed.',
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Import chat exports from WhatsApp',
    formats: 'WhatsApp .txt export',
    consentText: 'Messages will be indexed locally for search and context.',
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportDigitalLifeScreen({
  isPremium = false,
  importSources = DEFAULT_IMPORT_SOURCES,
  progress = null,
  onImport,
}: ImportDigitalLifeScreenProps) {
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>{t('screen.import_life.title')}</Text>
      <Text style={styles.subtitle}>
        Expand what Semblance knows by importing data from other sources.
      </Text>

      {progress?.isActive && (
        <View style={styles.progressCard}>
          <Text style={styles.progressPhase}>{progress.phase}</Text>
          <Text style={styles.progressCount}>
            {progress.itemsProcessed} / {progress.totalItems} items
          </Text>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress.totalItems > 0 ? (progress.itemsProcessed / progress.totalItems) * 100 : 0}%`,
                },
              ]}
            />
          </View>
        </View>
      )}

      {importSources.map(source => (
        <View
          key={source.id}
          style={[styles.sourceCard, !isPremium && styles.sourceCardDisabled]}
        >
          <Text style={styles.sourceName}>{source.name}</Text>
          <Text style={styles.sourceDescription}>{source.description}</Text>
          <Text style={styles.sourceFormats}>{t('screen.import_life.formats', { formats: source.formats })}</Text>
          <Text style={styles.sourceConsent}>{source.consentText}</Text>

          {isPremium ? (
            <TouchableOpacity
              style={styles.importButton}
              onPress={() => onImport?.(source.id)}
              disabled={progress?.isActive}
            >
              <Text style={styles.importButtonText}>{t('button.import')}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.premiumGateText}>
              Available with Digital Representative
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
