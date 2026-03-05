import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DocumentPanelProps, DocumentPanelFile } from './DocumentPanel.types';
import { formatFileSize } from '@semblance/core/agent/attachments';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function FileRow({
  file,
  onRemove,
  onAddToKnowledge,
  t,
}: {
  file: DocumentPanelFile;
  onRemove: () => void;
  onAddToKnowledge: () => void;
  t: (key: string) => string;
}) {
  return (
    <View
      style={[styles.file, file.status === 'error' && styles.fileError]}
      accessibilityLabel={file.fileName}
    >
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{file.fileName}</Text>
        <Text style={styles.fileMeta}>
          {file.status === 'processing'
            ? t('document_panel.processing')
            : file.status === 'error'
              ? file.error ?? t('document_panel.error')
              : formatFileSize(file.sizeBytes)
          }
        </Text>
      </View>
      <View style={styles.fileActions}>
        {file.status === 'ready' && !file.addedToKnowledge && (
          <Pressable
            onPress={onAddToKnowledge}
            hitSlop={8}
            accessibilityLabel={t('document_panel.add_to_knowledge')}
            style={styles.actionBtn}
          >
            <Text style={styles.actionIcon}>+</Text>
          </Pressable>
        )}
        {file.addedToKnowledge && (
          <Text style={styles.knowledgeBadge}>&#10003;</Text>
        )}
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityLabel={t('document_panel.remove_file')}
          style={styles.actionBtn}
        >
          <Text style={styles.removeIcon}>x</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function DocumentPanel({
  files,
  open,
  onClose,
  onRemoveFile,
  onAddToKnowledge,
  onAttach,
}: DocumentPanelProps) {
  const { t } = useTranslation('agent');

  if (!open) return null;

  return (
    <View style={styles.container} accessibilityRole="complementary">
      <View style={styles.header}>
        <Text style={styles.title}>{t('document_panel.title')}</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('document_panel.close')}>
          <Text style={styles.closeText}>x</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {files.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('document_panel.empty')}</Text>
            <Pressable onPress={onAttach} style={styles.attachBtn}>
              <Text style={styles.attachBtnText}>{t('document_panel.attach_files')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {files.map(file => (
              <FileRow
                key={file.id}
                file={file}
                onRemove={() => onRemoveFile(file.id)}
                onAddToKnowledge={() => onAddToKnowledge(file.id)}
                t={t}
              />
            ))}
            <Pressable onPress={onAttach} style={[styles.attachBtn, styles.attachBtnBottom]}>
              <Text style={styles.attachBtnText}>{t('document_panel.attach_more')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brandColors.base,
    borderTopWidth: 1,
    borderTopColor: brandColors.s2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(107, 95, 168, 0.15)',
  },
  title: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    fontWeight: '500',
    color: brandColors.white,
  },
  closeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.md,
    color: brandColors.sv2,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: nativeSpacing.s3,
    gap: nativeSpacing.s2,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.sm,
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: brandColors.s2,
  },
  fileError: {
    borderColor: brandColors.critical,
  },
  fileInfo: {
    flex: 1,
    gap: 2,
  },
  fileName: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 12,
    color: brandColors.wDim,
  },
  fileMeta: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 11,
    color: brandColors.sv1,
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s1,
    marginLeft: nativeSpacing.s2,
  },
  actionBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
  },
  removeIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
  knowledgeBadge: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.veridian,
    paddingHorizontal: 4,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nativeSpacing.s6,
    gap: nativeSpacing.s3,
  },
  emptyText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
  attachBtn: {
    alignItems: 'center',
    padding: nativeSpacing.s3,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: brandColors.s3,
    borderRadius: nativeRadius.sm,
  },
  attachBtnBottom: {
    marginTop: nativeSpacing.s2,
  },
  attachBtnText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
  },
});
