// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React from 'react';
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

interface SkillEntry {
  id: string;
  name: string;
  category: string;
  description: string;
  builtIn: boolean;
}

const BUILT_IN_SKILLS: SkillEntry[] = [
  {
    id: 'email-triage',
    name: 'Email Triage',
    category: 'Communication',
    description: 'Categorize, prioritize, and draft responses to incoming emails.',
    builtIn: true,
  },
  {
    id: 'calendar-assist',
    name: 'Calendar Management',
    category: 'Scheduling',
    description: 'Create events, resolve conflicts, and suggest optimal meeting times.',
    builtIn: true,
  },
  {
    id: 'document-search',
    name: 'Document Search',
    category: 'Knowledge',
    description: 'Search indexed files and extract relevant information.',
    builtIn: true,
  },
  {
    id: 'web-search',
    name: 'Web Search',
    category: 'Research',
    description: 'Search the web via privacy-respecting engines (SearXNG / DuckDuckGo).',
    builtIn: true,
  },
  {
    id: 'contact-lookup',
    name: 'Contact Lookup',
    category: 'People',
    description: 'Find contact details and communication history.',
    builtIn: true,
  },
  {
    id: 'task-planning',
    name: 'Task Planning',
    category: 'Productivity',
    description: 'Break down goals into actionable steps with time estimates.',
    builtIn: true,
  },
];

export function SkillsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();

  const renderSkill = ({ item }: { item: SkillEntry }) => (
    <View style={styles.skillCard}>
      <View style={styles.skillHeader}>
        <View style={styles.skillTitleRow}>
          <Text style={styles.skillName}>{item.name}</Text>
          {item.builtIn && (
            <View style={styles.builtInBadge}>
              <Text style={styles.builtInText}>Built-in</Text>
            </View>
          )}
        </View>
        <Text style={styles.skillCategory}>{item.category}</Text>
      </View>
      <Text style={styles.skillDescription}>{item.description}</Text>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, styles.statusActive]} />
        <Text style={styles.statusText}>Active</Text>
      </View>
    </View>
  );

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Skills</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {semblance.initializing ? semblance.progressLabel : 'Loading skills...'}
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
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.subtitle}>
          {BUILT_IN_SKILLS.length} built-in skills active
        </Text>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Skill Management</Text>
        <Text style={styles.infoBody}>
          Skills are modular capabilities that Semblance uses to act on your behalf. Built-in
          skills ship with the app. Third-party skill packages can be installed and managed
          through the Semblance desktop app, where code signing and sandbox verification
          ensure safety.
        </Text>
      </View>

      <FlatList
        data={BUILT_IN_SKILLS}
        renderItem={renderSkill}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No skills installed.</Text>
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
  title: {
    fontFamily: 'DMSans-Regular',
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.primary,
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
  infoCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.primary,
    marginBottom: 8,
  },
  infoBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  separator: {
    height: 8,
  },
  skillCard: {
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  skillHeader: {
    marginBottom: 8,
  },
  skillTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  skillName: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  builtInBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.primarySubtleDark,
    borderRadius: 4,
  },
  builtInText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 10,
    color: colors.primary,
  },
  skillCategory: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.muted,
  },
  skillDescription: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 18,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.success,
  },
  emptyText: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 24,
  },
});

export default SkillsScreen;
