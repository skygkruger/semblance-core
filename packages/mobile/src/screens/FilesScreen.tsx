// FilesScreen — Mobile equivalent of desktop FilesScreen.
// Shows indexed directories, indexing status, and knowledge stats.
// On mobile, uses document picker to select folders/files for indexing.
// All data stays on device — indexing is performed locally.
//
// CRITICAL: No network imports. All file access is local.

import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';

interface IndexedDirectory {
  path: string;
  fileCount?: number;
  lastIndexed?: string;
}

interface IndexingStatus {
  state: 'idle' | 'scanning' | 'indexing' | 'complete' | 'error';
  filesScanned: number;
  filesTotal: number;
  chunksCreated: number;
  currentFile: string | null;
  error: string | null;
}

interface KnowledgeStats {
  documentCount: number;
  chunkCount: number;
  indexSizeBytes: number;
}

function StatCard({
  value,
  label,
  highlight,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={statStyles.card}>
      <Text style={[statStyles.value, highlight && statStyles.valueHighlight]}>
        {value}
      </Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: spacing.md,
  },
  value: {
    fontFamily: typography.fontMono,
    fontSize: 22,
    fontWeight: typography.weight.bold,
    color: colors.textPrimaryDark,
  },
  valueHighlight: {
    color: colors.primary,
  },
  label: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
});

function DirectoryRow({
  dir,
  onRemove,
  onRescan,
}: {
  dir: IndexedDirectory;
  onRemove: (path: string) => void;
  onRescan: (path: string) => void;
}) {
  const { t } = useTranslation();

  // Extract directory name from full path for display
  const dirName = dir.path.split('/').pop() || dir.path;

  return (
    <View style={dirRowStyles.container}>
      <View style={dirRowStyles.info}>
        <Text style={dirRowStyles.name} numberOfLines={1}>{dirName}</Text>
        <Text style={dirRowStyles.path} numberOfLines={1}>{dir.path}</Text>
        {dir.fileCount !== undefined && (
          <Text style={dirRowStyles.meta}>
            {t('screen.directory.file_count', { count: dir.fileCount })}
          </Text>
        )}
        {dir.lastIndexed && (
          <Text style={dirRowStyles.meta}>
            {t('screen.directory.last_indexed', { time: new Date(dir.lastIndexed).toLocaleDateString() })}
          </Text>
        )}
      </View>
      <View style={dirRowStyles.actions}>
        <TouchableOpacity
          style={dirRowStyles.actionButton}
          onPress={() => onRescan(dir.path)}
          accessibilityRole="button"
        >
          <Text style={dirRowStyles.actionText}>{t('button.sync')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[dirRowStyles.actionButton, dirRowStyles.removeButton]}
          onPress={() => onRemove(dir.path)}
          accessibilityRole="button"
        >
          <Text style={dirRowStyles.removeText}>{t('button.remove')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const dirRowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  name: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  path: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  meta: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textSecondaryDark,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: colors.textTertiary,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionText: {
    fontFamily: typography.fontBody,
    fontSize: 12,
    color: colors.textSecondaryDark,
  },
  removeButton: {
    borderColor: colors.attention,
  },
  removeText: {
    fontFamily: typography.fontBody,
    fontSize: 12,
    color: colors.attention,
  },
});

function ProgressBar({
  value,
  max,
  indeterminate,
}: {
  value: number;
  max: number;
  indeterminate?: boolean;
}) {
  const fraction = indeterminate ? 0.5 : (max > 0 ? value / max : 0);
  return (
    <View style={progressStyles.track}>
      <View
        style={[
          progressStyles.fill,
          { width: `${Math.min(fraction * 100, 100)}%` },
          indeterminate && progressStyles.indeterminate,
        ]}
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: colors.surface2Dark,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  indeterminate: {
    opacity: 0.6,
  },
});

export function FilesScreen() {
  const { t } = useTranslation();
  const [directories, setDirectories] = useState<IndexedDirectory[]>([]);
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>({
    state: 'idle',
    filesScanned: 0,
    filesTotal: 0,
    chunksCreated: 0,
    currentFile: null,
    error: null,
  });
  const [knowledgeStats, setKnowledgeStats] = useState<KnowledgeStats>({
    documentCount: 0,
    chunkCount: 0,
    indexSizeBytes: 0,
  });

  useEffect(() => {
    // Load knowledge stats from the runtime's core
    const state = getRuntimeState();
    if (state.core) {
      state.core.knowledge.getStats?.()
        .then((stats: Record<string, number>) => {
          setKnowledgeStats({
            documentCount: stats.documentCount ?? 0,
            chunkCount: stats.chunkCount ?? 0,
            indexSizeBytes: stats.indexSizeBytes ?? 0,
          });
        })
        .catch(() => {
          // Stats not available yet — keep defaults
        });
    }
  }, []);

  const handleAddFolder = useCallback(async () => {
    try {
      const DocumentPicker = await import('react-native-document-picker').catch(() => null);
      if (DocumentPicker) {
        const result = await DocumentPicker.default.pickDirectory();
        if (result?.uri) {
          const newDir: IndexedDirectory = {
            path: result.uri,
            fileCount: undefined,
            lastIndexed: undefined,
          };
          setDirectories((prev) => [...prev, newDir]);

          const runtimeState = getRuntimeState();
          if (runtimeState.core && runtimeState.core.knowledge) {
            try {
              setIndexingStatus({
                state: 'indexing',
                filesScanned: 0,
                filesTotal: 0,
                chunksCreated: 0,
                currentFile: null,
                error: null,
              });

              const indexResult = await runtimeState.core.knowledge.indexDirectory?.(result.uri, {
                onProgress: (scanned: number, total: number, currentFile: string) => {
                  setIndexingStatus((prev) => ({
                    ...prev,
                    state: 'indexing',
                    filesScanned: scanned,
                    filesTotal: total,
                    currentFile,
                  }));
                },
              });

              const filesIndexed = indexResult?.filesIndexed ?? 0;
              const chunks = indexResult?.chunksCreated ?? 0;

              setDirectories((prev) =>
                prev.map((d) =>
                  d.path === result.uri
                    ? { ...d, fileCount: filesIndexed, lastIndexed: new Date().toISOString() }
                    : d,
                ),
              );

              setIndexingStatus({
                state: 'complete',
                filesScanned: filesIndexed,
                filesTotal: filesIndexed,
                chunksCreated: chunks,
                currentFile: null,
                error: null,
              });

              const stats = await runtimeState.core.knowledge.getStats?.();
              if (stats) {
                setKnowledgeStats({
                  documentCount: stats.documentCount ?? 0,
                  chunkCount: stats.chunkCount ?? 0,
                  indexSizeBytes: stats.indexSizeBytes ?? 0,
                });
              }
            } catch (err) {
              console.error('[FilesScreen] indexing failed:', err);
              setIndexingStatus({
                state: 'error',
                filesScanned: 0,
                filesTotal: 0,
                chunksCreated: 0,
                currentFile: null,
                error: err instanceof Error ? err.message : 'Indexing failed',
              });
            }
          } else {
            setIndexingStatus({
              state: 'idle',
              filesScanned: 0,
              filesTotal: 0,
              chunksCreated: 0,
              currentFile: null,
              error: null,
            });
          }
        }
      } else {
        Alert.alert(
          t('screen.files.title'),
          t('screen.files.empty_directories'),
        );
      }
    } catch (err) {
      if ((err as Record<string, unknown>)?.code !== 'DOCUMENT_PICKER_CANCELED') {
        console.error('[FilesScreen] add folder failed:', err);
      }
    }
  }, [t]);

  const handleRemove = useCallback((path: string) => {
    Alert.alert(
      t('button.remove'),
      path,
      [
        { text: t('button.cancel'), style: 'cancel' },
        {
          text: t('button.remove'),
          style: 'destructive',
          onPress: () => {
            setDirectories((prev) => prev.filter((d) => d.path !== path));
          },
        },
      ],
    );
  }, [t]);

  const handleRescan = useCallback(async (path: string) => {
    setIndexingStatus({
      state: 'scanning',
      filesScanned: 0,
      filesTotal: 0,
      chunksCreated: 0,
      currentFile: null,
      error: null,
    });

    const runtimeState = getRuntimeState();
    if (runtimeState.core && runtimeState.core.knowledge) {
      try {
        const indexResult = await runtimeState.core.knowledge.indexDirectory?.(path, {
          onProgress: (scanned: number, total: number, currentFile: string) => {
            setIndexingStatus((prev) => ({
              ...prev,
              state: 'indexing',
              filesScanned: scanned,
              filesTotal: total,
              currentFile,
            }));
          },
        });

        const filesIndexed = indexResult?.filesIndexed ?? 0;
        const chunks = indexResult?.chunksCreated ?? 0;

        setDirectories((prev) =>
          prev.map((d) =>
            d.path === path
              ? { ...d, fileCount: filesIndexed, lastIndexed: new Date().toISOString() }
              : d,
          ),
        );

        setIndexingStatus({
          state: 'complete',
          filesScanned: filesIndexed,
          filesTotal: filesIndexed,
          chunksCreated: chunks,
          currentFile: null,
          error: null,
        });

        const stats = await runtimeState.core.knowledge.getStats?.();
        if (stats) {
          setKnowledgeStats({
            documentCount: stats.documentCount ?? 0,
            chunkCount: stats.chunkCount ?? 0,
            indexSizeBytes: stats.indexSizeBytes ?? 0,
          });
        }
      } catch (err) {
        console.error('[FilesScreen] re-index failed:', err);
        setIndexingStatus({
          state: 'error',
          filesScanned: 0,
          filesTotal: 0,
          chunksCreated: 0,
          currentFile: null,
          error: err instanceof Error ? err.message : 'Re-indexing failed',
        });
      }
    } else {
      setIndexingStatus({
        state: 'error',
        filesScanned: 0,
        filesTotal: 0,
        chunksCreated: 0,
        currentFile: null,
        error: 'Runtime not initialized',
      });
    }
  }, []);

  const indexSizeMb = (knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('screen.files.title')}</Text>

      {/* Indexed Directories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.files.section_directories')}</Text>
        <View style={styles.sectionCard}>
          {directories.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>{t('screen.files.empty_directories')}</Text>
            </View>
          ) : (
            directories.map((dir) => (
              <DirectoryRow
                key={dir.path}
                dir={dir}
                onRemove={handleRemove}
                onRescan={handleRescan}
              />
            ))
          )}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddFolder}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.add_folder')}
        >
          <Text style={styles.addButtonText}>{t('button.add_folder')}</Text>
        </TouchableOpacity>
      </View>

      {/* Indexing Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.files.section_indexing')}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.statusRow}>
            {indexingStatus.state === 'idle' || indexingStatus.state === 'complete' ? (
              <Text style={styles.statusText}>{t('screen.files.indexing_up_to_date')}</Text>
            ) : indexingStatus.state === 'error' ? (
              <Text style={[styles.statusText, { color: colors.attention }]}>
                {t('screen.files.indexing_error', { error: indexingStatus.error })}
              </Text>
            ) : (
              <View style={{ width: '100%' }}>
                <ProgressBar
                  value={indexingStatus.filesScanned}
                  max={indexingStatus.filesTotal || 1}
                  indeterminate={indexingStatus.state === 'scanning'}
                />
                <Text style={[styles.statusText, { marginTop: spacing.sm }]}>
                  {indexingStatus.state === 'scanning' && t('screen.files.indexing_scanning')}
                  {indexingStatus.state === 'indexing' && t('screen.files.indexing_progress', {
                    scanned: indexingStatus.filesScanned,
                    total: indexingStatus.filesTotal,
                  })}
                </Text>
                {indexingStatus.currentFile && (
                  <Text style={styles.currentFile} numberOfLines={1}>
                    {indexingStatus.currentFile}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Knowledge Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.files.section_stats')}</Text>
        <View style={styles.sectionCard}>
          <View style={styles.statsGrid}>
            <StatCard
              value={String(knowledgeStats.documentCount)}
              label={t('screen.files.stat_documents')}
              highlight
            />
            <StatCard
              value={String(knowledgeStats.chunkCount)}
              label={t('screen.files.stat_chunks')}
              highlight
            />
          </View>
          <View style={styles.statsGrid}>
            <StatCard
              value={`${indexSizeMb} MB`}
              label={t('screen.files.stat_index_size')}
            />
            <StatCard
              value=".txt, .md, .pdf, .docx"
              label={t('screen.files.stat_supported_types')}
            />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: 'hidden',
  },
  emptyRow: {
    padding: spacing.base,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  addButton: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.primary,
  },
  statusRow: {
    padding: spacing.base,
  },
  statusText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
  currentFile: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
  },
});
