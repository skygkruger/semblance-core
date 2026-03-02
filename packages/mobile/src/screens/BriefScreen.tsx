// BriefScreen — Morning Brief tab using BriefingCard from semblance-ui.
// Container fetches brief data and passes to the shared component.
// Data wired to Core in Sprint 5.

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { BriefingCard } from '@semblance/ui';
import type { BriefingItem } from '@semblance/ui';
import { colors, typography, spacing } from '../theme/tokens.js';

interface BriefScreenProps {
  userName?: string;
  isFoundingMember?: boolean;
  foundingSeat?: number;
}

export function BriefScreen({
  userName = 'there',
  isFoundingMember = false,
  foundingSeat,
}: BriefScreenProps) {
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Sprint 5 — wire to getMorningBrief() adapter for real data
    const timer = setTimeout(() => {
      setItems([
        { type: 'action', text: 'Scheduled 2 calendar events for this week' },
        { type: 'pending', text: '3 emails await review in Partner mode' },
        { type: 'insight', text: 'Your meeting frequency decreased 15% this month' },
        { type: 'action', text: 'Archived 12 newsletter emails overnight' },
        { type: 'insight', text: 'You have a free afternoon on Thursday' },
      ]);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Preparing your brief...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BriefingCard
        items={items}
        userName={userName}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
});
