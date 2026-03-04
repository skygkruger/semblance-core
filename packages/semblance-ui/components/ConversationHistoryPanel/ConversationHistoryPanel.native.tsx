import { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet } from 'react-native';
import type { ConversationHistoryPanelProps, ConversationHistoryItem } from './ConversationHistoryPanel.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupByDate(items: ConversationHistoryItem[]): Array<{ label: string; items: ConversationHistoryItem[] }> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const pinned: ConversationHistoryItem[] = [];
  const today: ConversationHistoryItem[] = [];
  const yesterday: ConversationHistoryItem[] = [];
  const thisWeek: ConversationHistoryItem[] = [];
  const earlier: ConversationHistoryItem[] = [];

  for (const item of items) {
    if (item.pinned) { pinned.push(item); continue; }
    const d = new Date(item.updatedAt);
    if (d >= todayStart) today.push(item);
    else if (d >= yesterdayStart) yesterday.push(item);
    else if (d >= weekStart) thisWeek.push(item);
    else earlier.push(item);
  }

  const groups: Array<{ label: string; items: ConversationHistoryItem[] }> = [];
  if (pinned.length > 0) groups.push({ label: 'Pinned', items: pinned });
  if (today.length > 0) groups.push({ label: 'Today', items: today });
  if (yesterday.length > 0) groups.push({ label: 'Yesterday', items: yesterday });
  if (thisWeek.length > 0) groups.push({ label: 'This Week', items: thisWeek });
  if (earlier.length > 0) groups.push({ label: 'Earlier', items: earlier });
  return groups;
}

function ConversationRow({
  item,
  isActive,
  onSelect,
  onPin,
  onUnpin,
  onDelete,
}: {
  item: ConversationHistoryItem;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
  onUnpin: () => void;
  onDelete: () => void;
}) {
  const displayTitle = item.title ?? item.autoTitle ?? 'New conversation';

  return (
    <Pressable
      onPress={onSelect}
      onLongPress={() => {
        // Long-press actions handled natively via alert or bottom sheet
        // For MVP, toggle pin on long press
        if (item.pinned) onUnpin(); else onPin();
      }}
      style={[styles.row, isActive && styles.rowActive]}
      accessibilityLabel={displayTitle}
    >
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, isActive && styles.rowTitleActive]} numberOfLines={1}>
          {item.pinned && <Text style={styles.pinBadge}>* </Text>}
          {displayTitle}
        </Text>
        {item.lastMessagePreview && (
          <Text style={styles.rowPreview} numberOfLines={1}>{item.lastMessagePreview}</Text>
        )}
      </View>
      <Text style={styles.rowTime}>{formatTimeAgo(item.updatedAt)}</Text>
    </Pressable>
  );
}

export function ConversationHistoryPanel({
  items,
  activeId,
  open,
  searchQuery,
  onSearchChange,
  onSelect,
  onNew,
  onPin,
  onUnpin,
  onRename,
  onDelete,
  onClose,
}: ConversationHistoryPanelProps) {
  const groups = useMemo(() => groupByDate(items), [items]);

  if (!open) return null;

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{'History'}</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={onNew} hitSlop={8} accessibilityLabel="New conversation">
              <Text style={styles.newBtn}>+</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Text style={styles.closeBtn}>x</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={brandColors.sv1}
            value={searchQuery}
            onChangeText={onSearchChange}
            returnKeyType="search"
          />
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              </Text>
            </View>
          ) : (
            groups.map((group) => (
              <View key={group.label}>
                <Text style={styles.sectionLabel}>{group.label}</Text>
                {group.items.map((item) => (
                  <ConversationRow
                    key={item.id}
                    item={item}
                    isActive={item.id === activeId}
                    onSelect={() => onSelect(item.id)}
                    onPin={() => onPin(item.id)}
                    onUnpin={() => onUnpin(item.id)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nativeSpacing.s4,
    paddingTop: nativeSpacing.s6,
    paddingBottom: nativeSpacing.s2,
  },
  title: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.md,
    color: brandColors.white,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
  },
  newBtn: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.lg,
    color: brandColors.veridian,
  },
  closeBtn: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.md,
    color: brandColors.sv2,
  },
  searchWrap: {
    paddingHorizontal: nativeSpacing.s4,
    paddingBottom: nativeSpacing.s2,
  },
  searchInput: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.white,
    backgroundColor: brandColors.s1,
    borderWidth: 1,
    borderColor: brandColors.s2,
    borderRadius: nativeRadius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: nativeSpacing.s2,
    paddingBottom: nativeSpacing.s4,
  },
  sectionLabel: {
    fontFamily: nativeFontFamily.uiMedium,
    fontWeight: '600',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: brandColors.sv1,
    paddingHorizontal: nativeSpacing.s2,
    paddingTop: nativeSpacing.s3,
    paddingBottom: nativeSpacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: nativeSpacing.s3,
    paddingVertical: nativeSpacing.s2,
    borderRadius: nativeRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    gap: nativeSpacing.s2,
  },
  rowActive: {
    borderLeftColor: brandColors.veridian,
    backgroundColor: 'rgba(110, 207, 163, 0.06)',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.wDim,
  },
  rowTitleActive: {
    color: brandColors.white,
  },
  rowPreview: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 11,
    color: brandColors.sv1,
    marginTop: 2,
  },
  rowTime: {
    fontFamily: nativeFontFamily.ui,
    fontSize: 10,
    color: brandColors.sv1,
    paddingTop: 2,
  },
  pinBadge: {
    color: brandColors.amber,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: nativeSpacing.s8,
  },
  emptyText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
});
