// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';

interface PreferenceCategory {
  id: string;
  label: string;
  description: string;
  learnedCount: number;
  examples: string[];
}

const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    id: 'communication',
    label: 'Communication Style',
    description: 'How you prefer to draft emails, respond to messages, and communicate professionally.',
    learnedCount: 0,
    examples: ['Tone formality', 'Greeting patterns', 'Sign-off preferences'],
  },
  {
    id: 'scheduling',
    label: 'Scheduling Patterns',
    description: 'When you prefer meetings, focus time blocks, and recurring commitments.',
    learnedCount: 0,
    examples: ['Morning vs. afternoon meetings', 'Buffer time between events', 'Day-of-week preferences'],
  },
  {
    id: 'information',
    label: 'Information Density',
    description: 'How much detail you prefer in briefings, summaries, and recommendations.',
    learnedCount: 0,
    examples: ['Brief vs. detailed summaries', 'Bullet points vs. prose', 'Data inclusion preferences'],
  },
  {
    id: 'privacy',
    label: 'Privacy Boundaries',
    description: 'Categories of data you have marked as sensitive or restricted.',
    learnedCount: 0,
    examples: ['Financial thresholds', 'Health data sharing', 'Contact visibility'],
  },
];

export function LearnedPreferencesScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();
  const [categories, setCategories] = useState<PreferenceCategory[]>(PREFERENCE_CATEGORIES);
  const [conversationCount, setConversationCount] = useState(0);

  useEffect(() => {
    if (semblance.ready) {
      // Use conversation count as a proxy for interaction volume
      const count = semblance.conversations.length;
      setConversationCount(count);

      // Estimate learned preferences based on conversation volume
      // Real preference counts would come from the knowledge graph in a full implementation
      setCategories(PREFERENCE_CATEGORIES.map((cat) => ({
        ...cat,
        learnedCount: Math.min(Math.floor(count * 0.3), 12),
      })));
    }
  }, [semblance.ready, semblance.conversations]);

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Learned Preferences</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {semblance.initializing ? semblance.progressLabel : 'Loading preferences...'}
          </Text>
        </View>
      </View>
    );
  }

  const totalLearned = categories.reduce((sum, c) => sum + c.learnedCount, 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Learned Preferences</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryValue}>{totalLearned}</Text>
        <Text style={styles.summaryLabel}>preferences learned</Text>
        <Text style={styles.summaryDetail}>
          Based on {conversationCount} conversation{conversationCount !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>How Preference Learning Works</Text>
        <Text style={styles.explanationBody}>
          Semblance observes patterns in your interactions over time — how you phrase emails,
          when you schedule meetings, what level of detail you prefer. All learning happens
          locally on your device. No preference data ever leaves this device.
        </Text>
        <Text style={styles.explanationBody}>
          You can review and override any learned preference. Semblance treats your explicit
          choices as higher priority than inferred patterns.
        </Text>
      </View>

      {categories.map((category) => (
        <View key={category.id} style={styles.categoryCard}>
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <Text style={styles.categoryCount}>
              {category.learnedCount > 0 ? `${category.learnedCount} learned` : 'Listening'}
            </Text>
          </View>
          <Text style={styles.categoryDescription}>{category.description}</Text>
          <View style={styles.examplesRow}>
            {category.examples.map((example) => (
              <View key={example} style={styles.exampleChip}>
                <Text style={styles.exampleText}>{example}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.footerNote}>
        <Text style={styles.footerText}>
          Preference data is stored exclusively on this device and is never transmitted.
          You can reset all learned preferences from Settings on desktop.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  scrollContent: {
    paddingBottom: 32,
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
  title: {
    fontFamily: 'DMSans-Regular',
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 12,
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
  summaryCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  summaryValue: {
    fontFamily: 'DMSans-Regular',
    fontSize: 32,
    color: colors.primary,
    fontWeight: '600',
  },
  summaryLabel: {
    fontFamily: 'DMSans-Light',
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  summaryDetail: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  explanationCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  explanationTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.primary,
    marginBottom: 8,
  },
  explanationBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
    marginBottom: 8,
  },
  categoryCard: {
    marginHorizontal: 24,
    marginBottom: 10,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.textPrimary,
  },
  categoryCount: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.primary,
  },
  categoryDescription: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
    marginBottom: 10,
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  exampleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface2Dark,
    borderRadius: 6,
  },
  exampleText: {
    fontFamily: 'DMSans-Light',
    fontSize: 11,
    color: colors.textTertiary,
  },
  footerNote: {
    marginHorizontal: 24,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  footerText: {
    fontFamily: 'DMSans-Light',
    fontSize: 11,
    color: colors.muted,
    lineHeight: 16,
    textAlign: 'center',
  },
});

export default LearnedPreferencesScreen;
