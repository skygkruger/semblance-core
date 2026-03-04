import { useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ArtifactPanelProps, ArtifactItem } from './ArtifactPanel.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function ArtifactContent({ artifact }: { artifact: ArtifactItem }) {
  const isCode = artifact.type === 'code' || artifact.type === 'json';

  return (
    <View style={[styles.contentBlock, isCode && styles.codeBlock]}>
      <Text
        style={isCode ? styles.codeText : styles.plainText}
        selectable
      >
        {artifact.content}
      </Text>
    </View>
  );
}

export function ArtifactPanel({
  artifact,
  open,
  onClose,
  onDownload,
}: ArtifactPanelProps) {
  const { t } = useTranslation('agent');

  const handleDownload = useCallback(() => {
    if (!artifact || !onDownload) return;
    onDownload(artifact);
  }, [artifact, onDownload]);

  if (!open || !artifact) return null;

  return (
    <View style={styles.container} accessibilityRole="complementary">
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{artifact.type}</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{artifact.title}</Text>
        </View>
        <View style={styles.headerActions}>
          {onDownload && (
            <Pressable onPress={handleDownload} hitSlop={8} style={styles.actionBtn}>
              <Text style={styles.actionText}>DL</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('artifact_panel.close')}>
            <Text style={styles.closeText}>x</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <ArtifactContent artifact={artifact} />
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
    borderBottomColor: brandColors.s2,
    gap: nativeSpacing.s2,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(110, 207, 163, 0.25)',
    borderRadius: 4,
  },
  typeBadgeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    color: brandColors.veridian,
  },
  title: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    fontWeight: '500',
    color: brandColors.white,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  actionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actionText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
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
  },
  contentBlock: {
    padding: nativeSpacing.s3,
    borderRadius: nativeRadius.sm,
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: brandColors.s2,
  },
  codeBlock: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  codeText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.sm,
    lineHeight: 20.8,
    color: brandColors.wDim,
  },
  plainText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 14,
    lineHeight: 22,
    color: brandColors.sv3,
  },
});
