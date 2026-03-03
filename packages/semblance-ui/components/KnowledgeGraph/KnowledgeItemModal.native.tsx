// Knowledge Item Modal — React Native implementation.
// Full item detail with 5 curation actions.
// Delete has inline confirmation step — never auto-confirm destructive disk ops.

import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';
import type { KnowledgeItemModalProps } from './KnowledgeItemModal.types';

function getSourceLabel(source: string): string {
  switch (source) {
    case 'local_file': return 'Local File';
    case 'email': return 'Email';
    case 'calendar': return 'Calendar';
    case 'browser_history': return 'Browser';
    case 'financial': return 'Financial';
    case 'health': return 'Health';
    case 'contact': return 'Contact';
    case 'note': return 'Note';
    case 'conversation': return 'Conversation';
    default: return 'Document';
  }
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'local_file': return '[F]';
    case 'email': return '[@]';
    case 'calendar': return '[C]';
    case 'browser_history': return '[/]';
    case 'financial': return '[$]';
    case 'health': return '[+]';
    case 'contact': return '[P]';
    case 'note': return '[N]';
    case 'conversation': return '[>]';
    default: return '[D]';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function KnowledgeItemModal({
  item,
  onClose,
  onRemove,
  onDelete,
  onRecategorize,
  onReindex,
  onOpenInChat,
  reindexing,
}: KnowledgeItemModalProps) {
  const { t } = useTranslation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [item?.chunkId]);

  const handleRemove = useCallback(() => {
    if (!item) return;
    onRemove(item.chunkId);
  }, [item, onRemove]);

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!item) return;
    onDelete(item.chunkId);
    setShowDeleteConfirm(false);
  }, [item, onDelete]);

  const handleRecategorize = useCallback(() => {
    if (!item) return;
    onRecategorize(item.chunkId);
  }, [item, onRecategorize]);

  const handleReindex = useCallback(() => {
    if (!item) return;
    onReindex(item.chunkId);
  }, [item, onReindex]);

  const handleOpenInChat = useCallback(() => {
    if (!item) return;
    onOpenInChat(item.chunkId);
  }, [item, onOpenInChat]);

  if (!item) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceIcon}>{getSourceIcon(item.source)}</Text>
                <Text style={styles.sourceLabel}>{getSourceLabel(item.source)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Text style={styles.closeX}>x</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Meta */}
            <View style={styles.meta}>
              <Text style={styles.metaText}>{formatDate(item.indexedAt)}</Text>
              {item.mimeType ? <Text style={styles.metaText}>{item.mimeType}</Text> : null}
            </View>

            <View style={styles.categoryBadge}>
              <View style={styles.categoryDot} />
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>

            <View style={styles.separator} />

            {/* Preview */}
            <Text style={styles.preview}>{item.preview}</Text>

            <View style={styles.separator} />

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable style={styles.action} onPress={handleOpenInChat} accessibilityRole="button">
                <Text style={[styles.actionIcon, { color: brandColors.veridian }]}>[&gt;]</Text>
                <Text style={styles.actionLabel}>{t('knowledge_graph.open_in_chat', 'Open in chat')}</Text>
              </Pressable>

              <Pressable style={styles.action} onPress={handleRecategorize} accessibilityRole="button">
                <Text style={[styles.actionIcon, { color: brandColors.veridian }]}>[~]</Text>
                <Text style={styles.actionLabel}>{t('knowledge_graph.recategorize', 'Recategorize')}</Text>
              </Pressable>

              <Pressable
                style={[styles.action, reindexing ? styles.actionDisabled : null]}
                onPress={handleReindex}
                disabled={reindexing}
                accessibilityRole="button"
              >
                <Text style={[styles.actionIcon, { color: brandColors.silver }]}>[R]</Text>
                <Text style={styles.actionLabel}>{t('knowledge_graph.reindex', 'Re-index')}</Text>
                {reindexing ? (
                  <ActivityIndicator size="small" color={brandColors.silver} style={styles.spinner} />
                ) : null}
              </Pressable>

              <Pressable style={styles.action} onPress={handleRemove} accessibilityRole="button">
                <Text style={[styles.actionIcon, { color: brandColors.amber }]}>[x]</Text>
                <Text style={styles.actionLabel}>{t('knowledge_graph.remove_from_graph', 'Remove from graph')}</Text>
              </Pressable>

              {!showDeleteConfirm ? (
                <Pressable style={styles.action} onPress={handleDeleteClick} accessibilityRole="button">
                  <Text style={[styles.actionIcon, { color: brandColors.rust }]}>[!]</Text>
                  <Text style={[styles.actionLabel, { color: brandColors.rust }]}>{t('knowledge_graph.delete_from_disk', 'Delete from disk')}</Text>
                </Pressable>
              ) : (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmText}>
                    {t('knowledge_graph.delete_confirm', 'This will permanently delete the source file from your device. This cannot be undone.')}
                  </Text>
                  <View style={styles.confirmButtons}>
                    <Pressable
                      style={styles.confirmBtnCancel}
                      onPress={() => setShowDeleteConfirm(false)}
                    >
                      <Text style={styles.confirmBtnCancelText}>{t('common.cancel', 'Cancel')}</Text>
                    </Pressable>
                    <Pressable style={styles.confirmBtnDelete} onPress={handleDeleteConfirm}>
                      <Text style={styles.confirmBtnDeleteText}>{t('knowledge_graph.confirm_delete', 'Delete permanently')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '90%',
    maxWidth: 480,
    maxHeight: '85%',
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: brandColors.b2,
    borderRadius: nativeRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  headerContent: {
    flex: 1,
    marginRight: 12,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sourceIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv2,
  },
  sourceLabel: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv1,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: 16,
    color: brandColors.white,
    lineHeight: 22,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeX: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 14,
    color: brandColors.sv2,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  meta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metaText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: '#3E4652',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brandColors.veridian,
  },
  categoryText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 10,
    color: brandColors.sv2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 16,
  },
  preview: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 13,
    color: brandColors.sv3,
    lineHeight: 20,
  },
  actions: {
    gap: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 6,
    minHeight: 44,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionIcon: {
    fontFamily: nativeFontFamily.mono,
    fontSize: 11,
    width: 20,
    textAlign: 'center',
  },
  actionLabel: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 13,
    color: brandColors.wDim,
  },
  spinner: {
    marginLeft: 'auto',
  },
  confirmBox: {
    padding: 12,
    backgroundColor: 'rgba(201, 123, 110, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(201, 123, 110, 0.15)',
    borderRadius: 8,
    gap: 8,
  },
  confirmText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: brandColors.rust,
    lineHeight: 17,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtnCancel: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  confirmBtnCancelText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: brandColors.sv2,
  },
  confirmBtnDelete: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(201, 123, 110, 0.15)',
    alignItems: 'center',
  },
  confirmBtnDeleteText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 12,
    color: brandColors.rust,
  },
});
