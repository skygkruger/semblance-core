import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, typographyPresets } from '../theme/tokens.js';
import {
  listMobileSharedSpaceItems,
  listMobileSharedSpaces,
  type MobileSharedSpaceItemSummary,
  type MobileSharedSpaceSummary,
} from '../services/shared-space-client.js';

export function SharedSpacesScreen() {
  const [spaces, setSpaces] = useState<MobileSharedSpaceSummary[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [items, setItems] = useState<MobileSharedSpaceItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSpaces = await listMobileSharedSpaces();
      setSpaces(nextSpaces);
      const activeSpaceId = selectedSpaceId ?? nextSpaces[0]?.sharedSpaceId ?? null;
      setSelectedSpaceId(activeSpaceId);
      if (activeSpaceId) {
        setItems(await listMobileSharedSpaceItems(activeSpaceId));
      } else {
        setItems([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectSpace = useCallback(async (sharedSpaceId: string) => {
    setSelectedSpaceId(sharedSpaceId);
    setItems(await listMobileSharedSpaceItems(sharedSpaceId));
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Shared Spaces</Text>
      <Text style={styles.subtitle}>
        Peer view of explicitly shared commitments, plans, and delegated actions.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {spaces.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No shared spaces on this device yet</Text>
          <Text style={styles.emptyBody}>
            Shared-space membership syncs from your sovereign devices. Connect desktop or another peer to begin collaborating.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.chipsRow}>
            {spaces.map((space) => {
              const active = space.sharedSpaceId === selectedSpaceId;
              return (
                <TouchableOpacity
                  key={space.sharedSpaceId}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => void selectSpace(space.sharedSpaceId)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {space.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedSpaceId ? (
            <>
              <View style={styles.metricsRow}>
                <Metric label="Members" value={String(spaces.find((s) => s.sharedSpaceId === selectedSpaceId)?.memberCount ?? 0)} />
                <Metric label="Items" value={String(items.length)} />
                <Metric
                  label="Pending"
                  value={String(spaces.find((s) => s.sharedSpaceId === selectedSpaceId)?.pendingApprovals ?? 0)}
                />
              </View>

              <Text style={styles.sectionTitle}>Shared items</Text>
              {items.length === 0 ? (
                <Text style={styles.emptyBody}>No shared workflow items yet.</Text>
              ) : (
                items.map((item) => (
                  <View key={item.itemId} style={styles.itemCard}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemMeta}>
                      {item.kind} · {item.status} · {item.ownerMemberId}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : null}
        </>
      )}

      <TouchableOpacity style={styles.refreshButton} onPress={() => void load()}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.metricValue}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgDark,
  },
  title: {
    ...typographyPresets.titleMd,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typographyPresets.bodySm,
    color: colors.muted,
  },
  sectionTitle: {
    ...typographyPresets.bodyXs,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(110, 207, 163, 0.12)',
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface1Dark,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  itemCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  emptyCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: colors.attention,
  },
});
