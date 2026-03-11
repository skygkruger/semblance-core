// BriefScreen — Morning Brief tab using BriefingCard from semblance-ui.
// Container fetches brief data from the mobile AI runtime's knowledge graph.
//
// CRITICAL: No network imports. All data comes from local knowledge graph.

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BriefingCard } from '@semblance/ui';
import type { BriefingItem } from '@semblance/ui';
import { colors, typography, spacing } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';

interface BriefScreenProps {
  userName?: string;
  isFoundingMember?: boolean;
  foundingSeat?: number;
}

export function BriefScreen({
  userName,
  isFoundingMember = false,
  foundingSeat,
}: BriefScreenProps) {
  const { t } = useTranslation();
  const semblance = useSemblance();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate morning brief from knowledge graph
  useEffect(() => {
    if (!semblance.ready) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function generateBrief() {
      try {
        // Search knowledge graph for recent and relevant items
        const recentDocs = await semblance.searchKnowledge('recent activity today', 10);

        if (cancelled) return;

        const briefItems: BriefingItem[] = [];

        // Generate brief items from knowledge graph results
        if (recentDocs.length > 0) {
          for (const doc of recentDocs.slice(0, 5)) {
            briefItems.push({
              id: `brief_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: 'insight',
              title: doc.content.slice(0, 60) + (doc.content.length > 60 ? '...' : ''),
              description: doc.content.slice(0, 150),
              priority: doc.score > 0.8 ? 'high' : 'medium',
            });
          }
        }

        if (!cancelled) {
          setItems(briefItems);
          setLoading(false);
        }
      } catch (err) {
        console.error('[BriefScreen] Failed to generate brief:', err);
        if (!cancelled) setLoading(false);
      }
    }

    generateBrief();

    return () => { cancelled = true; };
  }, [semblance.ready, semblance.searchKnowledge]);

  if (semblance.initializing || loading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color="#6ECFA3" />
        <Text style={styles.loadingText}>{t('screen.brief.loading', { defaultValue: 'Preparing your briefing...' })}</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t('screen.brief.title', { defaultValue: 'Morning Brief' })}</Text>
        <Text style={styles.emptyText}>
          {semblance.ready
            ? 'No briefing items yet. Import data or connect services to see your daily brief.'
            : 'AI engine is loading. Your brief will appear once ready.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BriefingCard
        items={items}
        userName={userName ?? 'there'}
        isFoundingMember={isFoundingMember}
        foundingSeat={foundingSeat}
      />
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
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    color: colors.textPrimaryDark,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: '#8593A4',
    textAlign: 'center',
  },
  loadingText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.md,
  },
});
