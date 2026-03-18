// InboxScreen — Universal Inbox adapted for mobile touch interface.
// Pull-to-refresh, swipe actions (archive, categorize), category badges.
// Data loaded from Core's knowledge graph via inbox provider.

import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing } from '../theme/tokens.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import { fetchInbox, createCoreDataSource, createEmptyDataSource } from '../data/inbox-provider.js';

export interface InboxItem {
  id: string;
  type: 'email' | 'reminder' | 'action' | 'digest' | 'insight';
  title: string;
  preview: string;
  timestamp: string;
  read: boolean;
  category?: string;
  priority?: 'high' | 'normal' | 'low';
}

interface InboxScreenProps {
  items?: InboxItem[];
  onRefresh?: () => Promise<void>;
  onItemPress?: (item: InboxItem) => void;
}

function InboxCard({ item, onPress }: { item: InboxItem; onPress?: (item: InboxItem) => void }) {
  return (
    <View
      style={[styles.card, !item.read && styles.cardUnread]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${item.type}: ${item.title}`}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.badge, badgeColor(item.type)]}>
          <Text style={styles.badgeText}>{item.type.toUpperCase()}</Text>
        </View>
        {item.priority === 'high' && (
          <View style={styles.priorityDot} />
        )}
        <Text style={styles.timestamp}>{item.timestamp}</Text>
      </View>
      <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.preview} numberOfLines={2}>
        {item.preview}
      </Text>
    </View>
  );
}

const INBOX_CATEGORY_COLORS = {
  reminder: '#2A2A3E',
  action: '#2E3A2A',
  digest: '#3A2E2A',
  insight: '#2A303E',
} as const;

function badgeColor(type: InboxItem['type']): { backgroundColor: string } {
  switch (type) {
    case 'email': return { backgroundColor: colors.primarySubtleDark };
    case 'reminder': return { backgroundColor: INBOX_CATEGORY_COLORS.reminder };
    case 'action': return { backgroundColor: INBOX_CATEGORY_COLORS.action };
    case 'digest': return { backgroundColor: INBOX_CATEGORY_COLORS.digest };
    case 'insight': return { backgroundColor: INBOX_CATEGORY_COLORS.insight };
    default: return { backgroundColor: colors.surface2Dark };
  }
}

export function InboxScreen({ items: propItems, onRefresh, onItemPress }: InboxScreenProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [loadedItems, setLoadedItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Items from props take precedence (allows parent to override), otherwise use loaded data
  const items = propItems ?? loadedItems;

  // Load inbox data from Core knowledge graph on mount
  useEffect(() => {
    let cancelled = false;

    async function loadInbox() {
      const { core } = getRuntimeState();
      const source = core ? createCoreDataSource() : createEmptyDataSource();

      try {
        const result = await fetchInbox(source);
        if (!cancelled) {
          setLoadedItems(result.items);
        }
      } catch (err) {
        console.error('[InboxScreen] Failed to load inbox:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInbox();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        // Default refresh: reload from Core knowledge graph
        const { core } = getRuntimeState();
        const source = core ? createCoreDataSource() : createEmptyDataSource();
        const result = await fetchInbox(source);
        setLoadedItems(result.items);
      }
    } catch (err) {
      console.error('[InboxScreen] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <InboxCard item={item} onPress={onItemPress} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('screen.inbox.all_clear')}</Text>
            <Text style={styles.emptyText}>
              Your inbox is empty. Semblance will notify you when something needs attention.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  list: {
    padding: spacing.base,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface1Dark,
    borderRadius: 12,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.borderDark,
    marginBottom: spacing.md,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    letterSpacing: 0.5,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.attention,
    marginLeft: spacing.sm,
  },
  timestamp: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginLeft: 'auto',
  },
  title: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.regular,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xs,
  },
  titleUnread: {
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  preview: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
  },
  emptyTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    color: colors.textPrimaryDark,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    maxWidth: 280,
  },
});
