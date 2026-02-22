// ClipboardBanner (Mobile) — In-app banner for recognized clipboard patterns.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';

interface ClipboardBannerProps {
  patternDescription: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function ClipboardBanner({
  patternDescription,
  actionLabel,
  onAction,
  onDismiss,
  autoDismissMs = 8000,
}: ClipboardBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onDismiss]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.description} numberOfLines={2}>
        {patternDescription}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => { onAction(); setVisible(false); }}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setVisible(false); onDismiss(); }}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  description: { fontSize: 14, color: '#333', marginBottom: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  actionButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  dismissText: { fontSize: 13, color: '#888', paddingVertical: 6 },
});
