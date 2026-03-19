// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';
import type { ConversationHistoryItem } from '../runtime/SemblanceProvider';

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function SessionsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();
  const [sessions, setSessions] = useState<ConversationHistoryItem[]>([]);

  useEffect(() => {
    if (semblance.ready) {
      semblance.refreshConversations();
    }
  }, [semblance.ready]);

  useEffect(() => {
    setSessions(semblance.conversations);
  }, [semblance.conversations]);

  const renderSession = ({ item }: { item: ConversationHistoryItem }) => {
    const displayTitle = item.title || item.autoTitle || 'Untitled Session';
    const preview = item.lastMessagePreview || 'No messages yet';

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => {
          semblance.switchConversation(item.id);
          navigation.goBack();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionTitle} numberOfLines={1}>{displayTitle}</Text>
          {item.pinned && (
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedText}>Pinned</Text>
            </View>
          )}
        </View>
        <Text style={styles.sessionPreview} numberOfLines={2}>{preview}</Text>
        <View style={styles.sessionMeta}>
          <Text style={styles.metaText}>{item.turnCount} messages</Text>
          <Text style={styles.metaDot}> / </Text>
          <Text style={styles.metaText}>{formatTimestamp(item.updatedAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Named Sessions</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {semblance.initializing ? semblance.progressLabel : 'Loading sessions...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Named Sessions</Text>
          <TouchableOpacity onPress={() => semblance.createConversation()} style={styles.newButton}>
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No sessions yet</Text>
            <Text style={styles.emptyBody}>
              Start a conversation to create your first session. Sessions persist
              across app restarts and can be resumed at any time.
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
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  backButton: {
    marginBottom: 16,
  },
  backText: {
    color: colors.textTertiary,
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: 'DMSans-Regular',
    fontSize: 17,
    color: colors.textPrimary,
  },
  newButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.primarySubtleDark,
    borderRadius: 8,
  },
  newButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  separator: {
    height: 8,
  },
  sessionCard: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionTitle: {
    flex: 1,
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  pinnedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primarySubtleDark,
    borderRadius: 4,
    marginLeft: 8,
  },
  pinnedText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 10,
    color: colors.primary,
  },
  sessionPreview: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 18,
    marginBottom: 8,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: 'DMSans-Light',
    fontSize: 11,
    color: colors.muted,
  },
  metaDot: {
    fontFamily: 'DMSans-Light',
    fontSize: 11,
    color: colors.muted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default SessionsScreen;
