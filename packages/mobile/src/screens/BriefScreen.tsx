// BriefScreen — Morning Brief tab using BriefingCard from semblance-ui.
// Container fetches brief data and passes to the shared component.

import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Briefing data will be populated once Core's getMorningBrief() adapter is wired via unified-bridge
  }, []);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          No briefing data yet. Import data on desktop to see it here.
        </Text>
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
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: '#8593A4',
    textAlign: 'center',
  },
});
