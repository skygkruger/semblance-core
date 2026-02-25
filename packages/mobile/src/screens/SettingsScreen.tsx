// SettingsScreen — All settings from desktop adapted for mobile.
// AI Engine, Web Search, Writing Style, Autonomy, Network Monitor, Devices.
// Data wired to Core in Commit 8.

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

export interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

export interface SettingsItem {
  id: string;
  label: string;
  description?: string;
  type: 'navigate' | 'toggle' | 'value';
  value?: string | boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
}

interface SettingsScreenProps {
  sections?: SettingsSection[];
  aiModelName?: string;
  autonomyTier?: string;
  networkMonitorCount?: number;
  onNavigate?: (screen: string) => void;
}

function SettingsRow({ item }: { item: SettingsItem }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={item.onPress}
      disabled={item.type === 'toggle'}
      accessibilityRole={item.type === 'toggle' ? 'switch' : 'button'}
    >
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        {item.description && (
          <Text style={styles.rowDescription}>{item.description}</Text>
        )}
      </View>
      {item.type === 'navigate' && (
        <Text style={styles.chevron}>&gt;</Text>
      )}
      {item.type === 'value' && (
        <Text style={styles.rowValue}>{String(item.value ?? '')}</Text>
      )}
      {item.type === 'toggle' && (
        <Switch
          value={item.value === true}
          onValueChange={item.onToggle}
          trackColor={{ false: colors.surface2Dark, true: colors.primaryActive }}
          thumbColor={item.value ? colors.primary : colors.textTertiary}
        />
      )}
    </TouchableOpacity>
  );
}

const DEFAULT_SECTIONS: SettingsSection[] = [
  {
    title: 'AI Engine',
    items: [
      { id: 'model', label: 'AI Model', type: 'value', value: 'Llama 3.2 3B' },
      { id: 'model-storage', label: 'Model Storage', type: 'navigate', description: 'Manage downloaded models' },
      { id: 'wifi-only', label: 'WiFi-Only Downloads', type: 'toggle', value: true },
    ],
  },
  {
    title: 'Autonomy',
    items: [
      { id: 'tier', label: 'Autonomy Tier', type: 'value', value: 'Partner' },
      { id: 'domains', label: 'Per-Domain Settings', type: 'navigate' },
    ],
  },
  {
    title: 'Features',
    items: [
      { id: 'web-search', label: 'Web Search', type: 'navigate', description: 'Search provider settings' },
      { id: 'writing-style', label: 'Writing Style', type: 'navigate', description: 'Communication style preferences' },
      { id: 'reminders', label: 'Reminders', type: 'navigate' },
    ],
  },
  {
    title: 'Your Digital Twin',
    items: [
      { id: 'living-will', label: 'Living Will', type: 'navigate', description: 'Encrypted digital twin export' },
      { id: 'inheritance', label: 'Inheritance Protocol', type: 'navigate', description: 'Trusted party access' },
      { id: 'semblance-network', label: 'Semblance Network', type: 'navigate', description: 'Peer-to-peer sharing' },
    ],
  },
  {
    title: 'Security',
    items: [
      { id: 'biometric', label: 'Biometric Lock', type: 'navigate', description: 'Face ID, Touch ID, fingerprint' },
      { id: 'backup', label: 'Encrypted Backup', type: 'navigate', description: 'Create and restore backups' },
    ],
  },
  {
    title: 'Privacy',
    items: [
      { id: 'privacy-dashboard', label: 'Privacy Dashboard', type: 'navigate', description: 'Data inventory and guarantees' },
      { id: 'network-monitor', label: 'Network Monitor', type: 'navigate', description: 'View all network activity' },
      { id: 'action-log', label: 'Action Log', type: 'navigate', description: 'Review autonomous actions' },
    ],
  },
  {
    title: 'Devices',
    items: [
      { id: 'paired-devices', label: 'Paired Devices', type: 'navigate' },
      { id: 'task-routing', label: 'Task Routing', type: 'navigate', description: 'Configure inference routing' },
    ],
  },
];

export function SettingsScreen({ sections = DEFAULT_SECTIONS }: SettingsScreenProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {sections.map(section => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, i) => (
              <React.Fragment key={item.id}>
                {i > 0 && <View style={styles.separator} />}
                <SettingsRow item={item} />
              </React.Fragment>
            ))}
          </View>
        </View>
      ))}
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  rowDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    marginRight: spacing.sm,
  },
  chevron: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textTertiary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginLeft: spacing.base,
  },
});
