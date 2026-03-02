// InheritanceScreen — Mobile interface for Inheritance Protocol.
// Enable/disable, trusted party CRUD, per-party actions/templates, global settings, test run.
// Premium-gated feature — business logic in packages/core/.
// CRITICAL: No networking imports. Inheritance configuration is local-only.

import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../../theme/tokens.js';

export interface TrustedParty {
  id: string;
  name: string;
  email: string;
  role: 'full-access' | 'limited-access' | 'notification-only';
  addedAt: string;
  lastVerifiedAt: string | null;
}

export interface InheritanceScreenProps {
  enabled: boolean;
  trustedParties: TrustedParty[];
  isPremium: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onAddParty: (party: { name: string; email: string; role: TrustedParty['role'] }) => void;
  onRemoveParty: (id: string) => void;
  onEditParty: (id: string, updates: Partial<TrustedParty>) => void;
  onTestRun: () => Promise<{ success: boolean; summary: string }>;
  onNavigateToActivation: () => void;
}

export const InheritanceScreen: React.FC<InheritanceScreenProps> = ({
  enabled,
  trustedParties,
  isPremium,
  onToggleEnabled,
  onAddParty,
  onRemoveParty,
  onTestRun,
  onNavigateToActivation,
}) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<TrustedParty['role']>('limited-access');
  const [testResult, setTestResult] = useState<{ success: boolean; summary: string } | null>(null);

  const handleAdd = () => {
    if (!newName.trim() || !newEmail.trim()) {
      Alert.alert('Required', 'Name and email are required.');
      return;
    }
    if (!newEmail.includes('@')) {
      Alert.alert('Invalid', 'Please enter a valid email address.');
      return;
    }
    onAddParty({ name: newName.trim(), email: newEmail.trim(), role: newRole });
    setNewName('');
    setNewEmail('');
    setShowAddForm(false);
  };

  const handleTestRun = async () => {
    const result = await onTestRun();
    setTestResult(result);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('screen.inheritance.title')}</Text>
      <Text style={styles.subtitle}>
        Pre-authorize actions for trusted parties to execute on your behalf.
      </Text>

      {/* Enable/Disable Toggle */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => onToggleEnabled(!enabled)}
      >
        <Text style={styles.toggleLabel}>{t('screen.inheritance.toggle_label')}</Text>
        <Text style={[styles.toggleValue, { color: enabled ? colors.success : colors.textTertiary }]}>
          {enabled ? 'Enabled' : 'Disabled'}
        </Text>
      </TouchableOpacity>

      {/* Trusted Parties */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('screen.inheritance.trusted_parties')}</Text>
          <TouchableOpacity onPress={() => setShowAddForm(!showAddForm)}>
            <Text style={styles.addButton}>{showAddForm ? '[Cancel]' : '[+ Add]'}</Text>
          </TouchableOpacity>
        </View>

        {showAddForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.input}
              placeholder={t('placeholder.name')}
              placeholderTextColor={colors.textTertiary}
              value={newName}
              onChangeText={setNewName}
              accessibilityLabel={t('a11y.trusted_party_name')}
            />
            <TextInput
              style={styles.input}
              placeholder={t('placeholder.email')}
              placeholderTextColor={colors.textTertiary}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              accessibilityLabel={t('a11y.trusted_party_email')}
            />
            <View style={styles.roleRow}>
              {(['full-access', 'limited-access', 'notification-only'] as const).map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleChip, newRole === role && styles.roleChipActive]}
                  onPress={() => setNewRole(role)}
                >
                  <Text style={[styles.roleChipText, newRole === role && styles.roleChipTextActive]}>
                    {role.replace('-', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.submitButton} onPress={handleAdd}>
              <Text style={styles.submitButtonText}>{t('screen.inheritance.add_trusted_party')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {trustedParties.length === 0 && !showAddForm && (
          <Text style={styles.emptyText}>{t('screen.inheritance.empty_trusted')}</Text>
        )}

        {trustedParties.map(party => (
          <View key={party.id} style={styles.partyCard}>
            <View style={styles.partyInfo}>
              <Text style={styles.partyName}>{party.name}</Text>
              <Text style={styles.partyEmail}>{party.email}</Text>
              <Text style={styles.partyRole}>{party.role.replace('-', ' ')}</Text>
            </View>
            <TouchableOpacity onPress={() => onRemoveParty(party.id)}>
              <Text style={styles.removeButton}>[x]</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.inheritance.section_actions')}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleTestRun}>
          <Text style={styles.actionButtonText}>{t('screen.inheritance.run_test')}</Text>
          <Text style={styles.actionDescription}>{t('screen.inheritance.test_description')}</Text>
        </TouchableOpacity>

        {testResult && (
          <View style={[styles.testBanner, { backgroundColor: testResult.success ? colors.successSubtle : colors.attentionSubtle }]}>
            <Text style={styles.testBannerText}>{testResult.summary}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={onNavigateToActivation}>
          <Text style={styles.actionButtonText}>{t('screen.inheritance.activation')}</Text>
          <Text style={styles.actionDescription}>{t('screen.inheritance.activation_description')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.base, paddingBottom: spacing['3xl'] },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.xl,
  },
  toggleLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  toggleValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  addButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  addForm: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  input: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  roleChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  roleChipActive: {
    backgroundColor: colors.primarySubtleDark,
    borderColor: colors.primary,
  },
  roleChipText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  roleChipTextActive: {
    color: colors.primary,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  submitButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    paddingVertical: spacing.md,
  },
  partyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  partyInfo: { flex: 1 },
  partyName: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  partyEmail: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: 2,
  },
  partyRole: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  removeButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.attention,
    padding: spacing.sm,
  },
  actionButton: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.base,
    marginBottom: spacing.sm,
  },
  actionButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    fontWeight: typography.weight.medium,
  },
  actionDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  testBanner: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  testBannerText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
  },
});
