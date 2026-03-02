// ContactDetailScreen — Full-screen contact detail for mobile.
// Shows all fields, communication frequency, and simplified sparkline.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

interface ContactDetail {
  id: string;
  displayName: string;
  givenName: string;
  familyName: string;
  emails: string[];
  phones: string[];
  organization: string;
  jobTitle: string;
  birthday: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  communicationFrequency: {
    emailsPerWeek: number;
    meetingsPerMonth: number;
    trend: string;
  } | null;
}

// Route params for ContactDetail — will be added to SettingsStackParamList in Sprint 5
type ContactDetailParams = { ContactDetail: { contactId: string } };
type Props = NativeStackScreenProps<ContactDetailParams, 'ContactDetail'>;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function FrequencyBar({ value, max, label }: { value: number; max: number; label: string }) {
  const width = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <View style={styles.freqBarContainer}>
      <Text style={styles.freqLabel}>{label}</Text>
      <View style={styles.freqBarBg}>
        <View style={[styles.freqBarFill, { width: `${width}%` }]} />
      </View>
      <Text style={styles.freqValue}>{value}</Text>
    </View>
  );
}

export function ContactDetailScreen({ route }: Props) {
  const { t } = useTranslation();
  const { contactId } = route.params;
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch via bridge. For now, placeholder.
    setLoading(false);
  }, [contactId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>{t('status.loading')}</Text>
      </View>
    );
  }

  if (!contact) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>{t('screen.contacts.not_found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatarLarge}>
          <Text style={styles.avatarLargeText}>{getInitials(contact.displayName)}</Text>
        </View>
        <Text style={styles.name}>{contact.displayName}</Text>
        {contact.jobTitle ? (
          <Text style={styles.subtitle}>
            {contact.jobTitle}{contact.organization ? ` at ${contact.organization}` : ''}
          </Text>
        ) : null}
        <View style={styles.badgeContainer}>
          <Text style={styles.badge}>{contact.relationshipType}</Text>
        </View>
      </View>

      {/* Contact info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('screen.relationships.section_info')}</Text>
        {contact.emails.map(e => (
          <InfoRow key={e} label={t('screen.relationships.label_email')} value={e} />
        ))}
        {contact.phones.map(p => (
          <InfoRow key={p} label={t('screen.relationships.label_phone')} value={p} />
        ))}
        <InfoRow label={t('screen.relationships.label_birthday')} value={contact.birthday} />
        <InfoRow label={t('screen.relationships.label_organization')} value={contact.organization} />
      </View>

      {/* Communication */}
      {contact.communicationFrequency && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('screen.relationships.section_communication')}</Text>
          <FrequencyBar label={t('screen.relationships.label_emails_week')} value={contact.communicationFrequency.emailsPerWeek} max={10} />
          <FrequencyBar label={t('screen.relationships.label_meetings_month')} value={contact.communicationFrequency.meetingsPerMonth} max={10} />
          <InfoRow label={t('screen.relationships.label_trend')} value={contact.communicationFrequency.trend} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: '#999', fontSize: 14 },
  header: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLargeText: { fontSize: 24, fontWeight: '600', color: '#666' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  badgeContainer: { marginTop: 8 },
  badge: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e5e5',
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 12 },
  infoRow: { flexDirection: 'row', paddingVertical: 6 },
  infoLabel: { width: 100, fontSize: 13, color: '#999' },
  infoValue: { flex: 1, fontSize: 14, color: '#333' },
  freqBarContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  freqLabel: { width: 100, fontSize: 13, color: '#999' },
  freqBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#f0f0f0' },
  freqBarFill: { height: 6, borderRadius: 3, backgroundColor: '#4A9B7F' },
  freqValue: { width: 40, textAlign: 'right', fontSize: 13, color: '#333' },
});
