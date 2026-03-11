// ActivityScreen — Mobile equivalent of desktop ActivityScreen.
// Shows the audit trail of actions Semblance has taken on the user's behalf.
// Filterable by status (all, success, pending, error).
// All data is local — pulled from the runtime's core action log.
//
// CRITICAL: No network imports. All audit data is device-local.

import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  status: 'success' | 'error' | 'pending' | 'rejected';
  autonomy_tier: string;
  payload_hash: string;
  audit_ref: string;
  estimated_time_saved_seconds: number;
}

type FilterStatus = 'all' | 'success' | 'pending' | 'error';

function FilterChip({
  label,
  isActive,
  onPress,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[chipStyles.chip, isActive && chipStyles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Text style={[chipStyles.text, isActive && chipStyles.textActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginRight: 8,
  },
  chipActive: {
    borderColor: 'rgba(110, 207, 163, 0.4)',
    backgroundColor: 'rgba(110, 207, 163, 0.06)',
  },
  text: {
    fontFamily: typography.fontMono,
    fontSize: 13,
    color: colors.textSecondaryDark,
  },
  textActive: {
    color: colors.primary,
  },
});

function ActionCard({ entry }: { entry: LogEntry }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const statusColor = entry.status === 'success'
    ? colors.success
    : entry.status === 'error'
      ? colors.attention
      : entry.status === 'pending'
        ? colors.accent
        : colors.textTertiary;

  const timeAgo = getTimeAgo(entry.timestamp, t);

  return (
    <TouchableOpacity
      style={cardStyles.container}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <View style={cardStyles.header}>
        <View style={[cardStyles.statusDot, { backgroundColor: statusColor }]} />
        <View style={cardStyles.headerContent}>
          <Text style={cardStyles.actionType}>{entry.action}</Text>
          <Text style={cardStyles.timestamp}>{timeAgo}</Text>
        </View>
        <View style={[cardStyles.statusBadge, { borderColor: statusColor }]}>
          <Text style={[cardStyles.statusText, { color: statusColor }]}>
            {entry.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={cardStyles.description} numberOfLines={expanded ? undefined : 2}>
        {entry.description}
      </Text>
      {entry.autonomy_tier && (
        <View style={cardStyles.tierBadge}>
          <Text style={cardStyles.tierText}>{entry.autonomy_tier.toUpperCase()}</Text>
        </View>
      )}
      {expanded && (
        <View style={cardStyles.detail}>
          <Text style={cardStyles.detailText}>
            {t('screen.activity.payload_hash', { hash: entry.payload_hash })}
          </Text>
          <Text style={cardStyles.detailText}>
            {t('screen.activity.audit_reference', { ref: entry.audit_ref })}
          </Text>
          {entry.estimated_time_saved_seconds > 0 && (
            <Text style={cardStyles.timeSaved}>
              {t('screen.inbox.time_saved', { time: formatTimeSaved(entry.estimated_time_saved_seconds) })}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatTimeSaved(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function getTimeAgo(timestamp: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('time.just_now');
  if (minutes < 60) return t('time.minutes_ago', { count: minutes });
  if (hours < 24) return t('time.hours_ago', { count: hours });
  if (days < 7) return t('time.days_ago', { count: days });
  return t('time.weeks_ago', { count: Math.floor(days / 7) });
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  headerContent: {
    flex: 1,
  },
  actionType: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
  },
  timestamp: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 1,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.5,
  },
  description: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    lineHeight: 20,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(110, 207, 163, 0.08)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  tierText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  detailText: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  timeSaved: {
    fontFamily: typography.fontMono,
    fontSize: 12,
    color: colors.primary,
    marginTop: 4,
  },
});

export function ActivityScreen() {
  const { t } = useTranslation();
  const { ready } = useSemblance();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const loadEntries = useCallback(async () => {
    try {
      const state = getRuntimeState();
      if (state.core) {
        // Load action log from the core's audit trail
        const log = await state.core.agent.getActionLog?.(50, 0) ?? [];
        setEntries(log.map((entry: Record<string, unknown>) => ({
          id: (entry.id as string) ?? String(Math.random()),
          timestamp: (entry.timestamp as string) ?? new Date().toISOString(),
          action: (entry.action as string) ?? 'unknown',
          description: (entry.description as string) ?? '',
          status: (entry.status as LogEntry['status']) ?? 'success',
          autonomy_tier: (entry.autonomy_tier as string) ?? 'partner',
          payload_hash: (entry.payload_hash as string) ?? '',
          audit_ref: (entry.audit_ref as string) ?? '',
          estimated_time_saved_seconds: (entry.estimated_time_saved_seconds as number) ?? 0,
        })));
      }
    } catch (err) {
      console.error('[ActivityScreen] loadEntries failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, ready]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  const filtered = filterStatus === 'all'
    ? entries
    : entries.filter((e) => e.status === filterStatus);

  const filterLabels: Record<FilterStatus, string> = {
    all: t('screen.activity.filter_all'),
    success: t('screen.activity.filter_success'),
    pending: t('screen.activity.filter_pending'),
    error: t('screen.activity.filter_error'),
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.title}>{t('screen.activity.title')}</Text>

      {/* Filter bar */}
      <View style={styles.filterBar}>
        {(Object.keys(filterLabels) as FilterStatus[]).map((status) => (
          <FilterChip
            key={status}
            label={filterLabels[status]}
            isActive={filterStatus === status}
            onPress={() => setFilterStatus(status)}
          />
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>
            {t('screen.activity.empty', { name: 'Semblance' })}
          </Text>
        </View>
      ) : (
        filtered.map((entry) => (
          <ActionCard key={entry.id} entry={entry} />
        ))
      )}
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
    marginBottom: spacing.base,
  },
  filterBar: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    lineHeight: 22,
  },
});
