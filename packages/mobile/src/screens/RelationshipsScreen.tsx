// RelationshipsScreen — Shows relationship map: contacts, communication frequency, strength.
// Loads data from the mobile AI runtime's knowledge graph.
//
// CRITICAL: No network imports. All data comes from local runtime state.

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContactSummary {
  id: string;
  displayName: string;
  organization: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  emails: string[];
}

interface ContactDetail extends ContactSummary {
  phones: string[];
  jobTitle: string;
  communicationFrequency: {
    emailsPerWeek: number;
    meetingsPerMonth: number;
    trend: string;
  } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function getRelationshipColor(type: string): string {
  switch (type) {
    case 'colleague': return '#D4A76A';
    case 'client': return '#7EB8DA';
    case 'vendor': return '#B8A5D6';
    case 'friend': return '#7EC9A0';
    case 'family': return '#F27A93';
    case 'acquaintance': return '#8593A4';
    default: return colors.muted;
  }
}

function formatLastContact(date: string | null): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ─── Frequency Dots ─────────────────────────────────────────────────────────

function FrequencyDots({ count }: { count: number }) {
  const maxDots = 5;
  const filled = Math.min(count, maxDots);
  return (
    <View style={dotsStyles.container}>
      {Array.from({ length: maxDots }).map((_, i) => (
        <View
          key={i}
          style={[
            dotsStyles.dot,
            { backgroundColor: i < filled ? colors.primary : colors.borderDark },
          ]}
        />
      ))}
    </View>
  );
}

const dotsStyles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

// ─── Component ──────────────────────────────────────────────────────────────

export function RelationshipsScreen() {
  const { t } = useTranslation();
  const semblance = useSemblance();
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [totalContacts, setTotalContacts] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    if (!semblance.ready) {
      setLoading(false);
      return;
    }

    try {
      const state = getRuntimeState();
      const core = state.core;

      if (!core) {
        setLoading(false);
        return;
      }

      const query = searchQuery.trim() || 'contact person communication';
      const results = await core.knowledge.search(query, { limit: 50 });

      const derivedContacts: ContactSummary[] = results
        .filter((r) => r.score > 0.2)
        .map((r, i) => {
          const meta = r.document?.metadata as Record<string, unknown> | undefined;
          return {
            id: `contact-${i}`,
            displayName: (meta?.displayName as string) ?? r.chunk.content.slice(0, 30).trim(),
            organization: (meta?.organization as string) ?? '',
            relationshipType: (meta?.relationshipType as string) ?? 'unknown',
            lastContactDate: (meta?.lastContactDate as string) ?? null,
            interactionCount: typeof meta?.interactionCount === 'number' ? meta.interactionCount : Math.ceil(r.score * 10),
            emails: Array.isArray(meta?.emails) ? (meta.emails as string[]) : [],
          };
        });

      setContacts(derivedContacts);
      setTotalContacts(derivedContacts.length);
    } catch (err) {
      console.error('[RelationshipsScreen] Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [semblance.ready, searchQuery]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleSelectContact = useCallback((contact: ContactSummary) => {
    setSelectedContact({
      ...contact,
      phones: [],
      jobTitle: '',
      communicationFrequency: contact.interactionCount > 0
        ? {
            emailsPerWeek: Math.ceil(contact.interactionCount / 4),
            meetingsPerMonth: Math.max(0, Math.floor(contact.interactionCount / 8)),
            trend: contact.interactionCount > 5 ? 'increasing' : 'stable',
          }
        : null,
    });
  }, []);

  if (semblance.initializing || loading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {t('screen.relationships.loading', { defaultValue: 'Loading relationships...' })}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>
        {t('screen.relationships.title', { defaultValue: 'Relationships' })}
      </Text>
      <Text style={styles.subtitle}>
        {t('screen.relationships.subtitle', { count: totalContacts })}
      </Text>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('screen.relationships.search_placeholder')}
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => loadContacts()}
          returnKeyType="search"
        />
      </View>

      {/* Contact Detail (if selected) */}
      {selectedContact && (
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={[styles.avatar, { backgroundColor: getRelationshipColor(selectedContact.relationshipType) + '30' }]}>
              <Text style={[styles.avatarText, { color: getRelationshipColor(selectedContact.relationshipType) }]}>
                {getInitials(selectedContact.displayName)}
              </Text>
            </View>
            <View style={styles.detailInfo}>
              <Text style={styles.detailName}>{selectedContact.displayName}</Text>
              {selectedContact.jobTitle ? (
                <Text style={styles.detailJob}>
                  {selectedContact.jobTitle}{selectedContact.organization ? ` at ${selectedContact.organization}` : ''}
                </Text>
              ) : selectedContact.organization ? (
                <Text style={styles.detailJob}>{selectedContact.organization}</Text>
              ) : null}
              <View style={[styles.typeBadge, { backgroundColor: getRelationshipColor(selectedContact.relationshipType) + '20' }]}>
                <Text style={[styles.typeBadgeText, { color: getRelationshipColor(selectedContact.relationshipType) }]}>
                  {selectedContact.relationshipType}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelectedContact(null)}>
              <Text style={styles.closeButton}>[x]</Text>
            </TouchableOpacity>
          </View>

          {selectedContact.communicationFrequency && (
            <View style={styles.freqGrid}>
              <View style={styles.freqItem}>
                <Text style={styles.freqValue}>{selectedContact.communicationFrequency.emailsPerWeek}</Text>
                <Text style={styles.freqLabel}>{t('screen.relationships.emails_week')}</Text>
              </View>
              <View style={styles.freqItem}>
                <Text style={styles.freqValue}>{selectedContact.communicationFrequency.meetingsPerMonth}</Text>
                <Text style={styles.freqLabel}>{t('screen.relationships.meetings_month')}</Text>
              </View>
              <View style={styles.freqItem}>
                <Text style={[styles.freqValue, { textTransform: 'capitalize' }]}>{selectedContact.communicationFrequency.trend}</Text>
                <Text style={styles.freqLabel}>{t('screen.relationships.trend')}</Text>
              </View>
            </View>
          )}

          {selectedContact.emails.length > 0 && (
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionLabel}>{t('screen.relationships.email')}</Text>
              {selectedContact.emails.map((email) => (
                <Text key={email} style={styles.detailSectionValue}>{email}</Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Contact List */}
      {contacts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('screen.relationships.no_contacts')}</Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? t('screen.relationships.no_match', { query: searchQuery })
              : t('screen.relationships.empty_hint')}
          </Text>
        </View>
      ) : (
        contacts.map((contact) => (
          <TouchableOpacity
            key={contact.id}
            style={[
              styles.contactCard,
              selectedContact?.id === contact.id && styles.contactCardActive,
            ]}
            onPress={() => handleSelectContact(contact)}
          >
            <View style={[styles.avatarSmall, { backgroundColor: getRelationshipColor(contact.relationshipType) + '30' }]}>
              <Text style={[styles.avatarSmallText, { color: getRelationshipColor(contact.relationshipType) }]}>
                {getInitials(contact.displayName)}
              </Text>
            </View>
            <View style={styles.contactInfo}>
              <View style={styles.contactNameRow}>
                <Text style={styles.contactName} numberOfLines={1}>{contact.displayName}</Text>
                <View style={[styles.typeBadgeSmall, { backgroundColor: getRelationshipColor(contact.relationshipType) + '20' }]}>
                  <Text style={[styles.typeBadgeSmallText, { color: getRelationshipColor(contact.relationshipType) }]}>
                    {contact.relationshipType}
                  </Text>
                </View>
              </View>
              <View style={styles.contactMeta}>
                {contact.organization ? (
                  <Text style={styles.contactOrg} numberOfLines={1}>{contact.organization}</Text>
                ) : null}
                <Text style={styles.contactLastSeen}>{formatLastContact(contact.lastContactDate)}</Text>
              </View>
            </View>
            <FrequencyDots count={Math.min(Math.ceil(contact.interactionCount / 3), 5)} />
          </TouchableOpacity>
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
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  loadingText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  subtitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchContainer: {
    marginBottom: spacing.lg,
  },
  searchInput: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Detail card
  detailCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.base,
    marginBottom: spacing.lg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  detailInfo: {
    flex: 1,
  },
  detailName: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  detailJob: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: 2,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  typeBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    textTransform: 'capitalize',
  },
  closeButton: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  freqGrid: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    gap: spacing.md,
  },
  freqItem: {
    flex: 1,
    alignItems: 'center',
  },
  freqValue: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
  },
  freqLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  detailSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
  },
  detailSectionLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  detailSectionValue: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textPrimaryDark,
  },
  // Contact list
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.md,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  contactCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmallText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactName: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
    flex: 1,
  },
  typeBadgeSmall: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.sm,
  },
  typeBadgeSmallText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  contactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  contactOrg: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    flex: 1,
  },
  contactLastSeen: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  // Empty state
  emptyCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.textPrimaryDark,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
