// DailyDigestCard — React Native equivalent of the desktop daily digest card.

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export interface DailyDigestData {
  id: string;
  summary: string;
  totalActions: number;
  timeSavedFormatted: string;
  emailsHandled: number;
  meetingsPrepped: number;
  remindersCreated: number;
  webSearches: number;
  dismissed: boolean;
}

interface DailyDigestCardProps {
  digest: DailyDigestData;
  onDismiss: (id: string) => void;
}

export function DailyDigestCard({ digest, onDismiss }: DailyDigestCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (digest.dismissed) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.label}>Daily Digest</Text>
          <Text style={styles.stats}>
            {digest.totalActions} actions | ~{digest.timeSavedFormatted} saved
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={styles.actionText}>{expanded ? 'Less' : 'More'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDismiss(digest.id)}>
            <Text style={styles.dismissText}>X</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.summary}>{digest.summary}</Text>
      {expanded && (
        <View style={styles.details}>
          {digest.emailsHandled > 0 && <Text style={styles.detailText}>Emails: {digest.emailsHandled}</Text>}
          {digest.meetingsPrepped > 0 && <Text style={styles.detailText}>Meetings: {digest.meetingsPrepped}</Text>}
          {digest.remindersCreated > 0 && <Text style={styles.detailText}>Reminders: {digest.remindersCreated}</Text>}
          {digest.webSearches > 0 && <Text style={styles.detailText}>Searches: {digest.webSearches}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6B7280',
  },
  stats: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 8,
  },
  actionText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  dismissText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  summary: {
    fontSize: 14,
    color: '#4B5563',
    marginTop: 8,
    lineHeight: 20,
  },
  details: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});
