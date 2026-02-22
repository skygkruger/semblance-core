// ContactsScreen — Mobile contact list with birthday section and search.
// React Native FlatList, birthday section at top, swipe actions.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  type ListRenderItemInfo,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

interface ContactSummary {
  id: string;
  displayName: string;
  organization: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  birthday: string;
}

interface BirthdayInfo {
  contactId: string;
  displayName: string;
  birthday: string;
  daysUntil: number;
  isToday: boolean;
}

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function BirthdaySection({ birthdays, onPress }: { birthdays: BirthdayInfo[]; onPress: (id: string) => void }) {
  if (birthdays.length === 0) return null;

  return (
    <View style={styles.birthdaySection}>
      <Text style={styles.sectionTitle}>Upcoming Birthdays</Text>
      {birthdays.map(b => (
        <TouchableOpacity key={b.contactId} style={styles.birthdayItem} onPress={() => onPress(b.contactId)}>
          <View style={styles.birthdayDot} />
          <Text style={styles.birthdayName}>{b.displayName}</Text>
          <Text style={styles.birthdayDays}>
            {b.isToday ? 'Today!' : `in ${b.daysUntil}d`}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function ContactsScreen({ navigation }: Props) {
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch via bridge. For now, placeholder.
    setLoading(false);
  }, []);

  const handleContactPress = useCallback((id: string) => {
    navigation.navigate('ContactDetail', { contactId: id });
  }, [navigation]);

  const renderContact = useCallback(({ item }: ListRenderItemInfo<ContactSummary>) => (
    <TouchableOpacity style={styles.contactRow} onPress={() => handleContactPress(item.id)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(item.displayName)}</Text>
      </View>
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>{item.displayName}</Text>
        {item.organization ? (
          <Text style={styles.contactOrg}>{item.organization}</Text>
        ) : null}
      </View>
      <Text style={styles.badge}>{item.relationshipType}</Text>
    </TouchableOpacity>
  ), [handleContactPress]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search contacts..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={contacts}
        keyExtractor={item => item.id}
        renderItem={renderContact}
        ListHeaderComponent={
          <BirthdaySection birthdays={birthdays} onPress={handleContactPress} />
        }
        ListEmptyComponent={
          loading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : (
            <Text style={styles.emptyText}>No contacts</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  searchInput: {
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    fontSize: 14,
  },
  birthdaySection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fef9f0',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b6914',
    marginBottom: 8,
  },
  birthdayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  birthdayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d4a76a',
    marginRight: 8,
  },
  birthdayName: { flex: 1, fontSize: 14, color: '#333' },
  birthdayDays: { fontSize: 12, color: '#8b6914', fontWeight: '500' },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5e5',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontSize: 14, fontWeight: '600', color: '#666' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
  contactOrg: { fontSize: 12, color: '#999', marginTop: 2 },
  badge: {
    fontSize: 10,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  emptyText: {
    textAlign: 'center',
    padding: 40,
    color: '#999',
    fontSize: 14,
  },
});
