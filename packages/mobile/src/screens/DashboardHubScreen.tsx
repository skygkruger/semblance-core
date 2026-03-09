// DashboardHubScreen — Hub for the Dashboards tab.
// Shows 4 cards: Inbox, Finance, Health, Contacts.
// Each card navigates into the full sub-screen within the Dashboards stack.

import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import type { DashboardsStackParamList } from '../navigation/types.js';

type Nav = NativeStackNavigationProp<DashboardsStackParamList>;

interface HubCard {
  id: string;
  titleKey: string;
  subtitleKey: string;
  route: keyof DashboardsStackParamList;
}

const CARDS: HubCard[] = [
  {
    id: 'inbox',
    titleKey: 'screen.dashboard_hub.inbox',
    subtitleKey: 'screen.dashboard_hub.inbox_subtitle',
    route: 'Inbox',
  },
  {
    id: 'finance',
    titleKey: 'screen.dashboard_hub.finance',
    subtitleKey: 'screen.dashboard_hub.finance_subtitle',
    route: 'FinancialDashboard',
  },
  {
    id: 'health',
    titleKey: 'screen.dashboard_hub.health',
    subtitleKey: 'screen.dashboard_hub.health_subtitle',
    route: 'HealthDashboard',
  },
  {
    id: 'contacts',
    titleKey: 'screen.dashboard_hub.contacts',
    subtitleKey: 'screen.dashboard_hub.contacts_subtitle',
    route: 'Contacts',
  },
];

export function DashboardHubScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t('screen.dashboard_hub.title')}</Text>
      <Text style={styles.subtitle}>{t('screen.dashboard_hub.subtitle')}</Text>

      <View style={styles.grid}>
        {CARDS.map((card) => (
          <Pressable
            key={card.id}
            style={({ pressed }) => [
              styles.card,
              pressed && styles.cardPressed,
            ]}
            onPress={() => navigation.navigate(card.route as never)}
          >
            <Text style={styles.cardTitle}>{t(card.titleKey)}</Text>
            <Text style={styles.cardSubtitle}>{t(card.subtitleKey)}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing['2xl'],
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.xl,
  },
  grid: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardPressed: {
    backgroundColor: 'rgba(110, 207, 163, 0.06)',
    borderColor: 'rgba(110, 207, 163, 0.25)',
  },
  cardTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
});
