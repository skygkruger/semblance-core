// MessageDraftCard (Mobile) — React Native version of SMS draft card.
// Shows recipient name + masked phone, body text, and Send/Edit/Cancel buttons.

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

interface MessageDraftCardProps {
  recipientName: string;
  maskedPhone: string;
  body: string;
  autonomyTier: 'guardian' | 'partner' | 'alter_ego';
  onSend: () => void;
  onEdit: (newBody: string) => void;
  onCancel: () => void;
}

export function MessageDraftCard({
  recipientName,
  maskedPhone,
  body,
  autonomyTier,
  onSend,
  onEdit,
  onCancel,
}: MessageDraftCardProps) {
  const [countdown, setCountdown] = useState<number | null>(
    autonomyTier === 'partner' ? 5 : null
  );
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const timer = setTimeout(() => {
      if (countdown === 1) {
        onSend();
        setSent(true);
        setCountdown(null);
      } else {
        setCountdown(countdown - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, onSend]);

  const handleSend = useCallback(() => {
    onSend();
    setSent(true);
  }, [onSend]);

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.successText}>Message sent to {recipientName}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{recipientName}</Text>
        <Text style={styles.phone}>{maskedPhone}</Text>
      </View>

      {editing ? (
        <View>
          <TextInput
            style={styles.input}
            value={editBody}
            onChangeText={setEditBody}
            multiline
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => { onEdit(editBody); setEditing(false); }}>
              <Text style={styles.buttonPrimary}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(false)}>
              <Text style={styles.buttonGhost}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text style={styles.body}>{body}</Text>
      )}

      {!editing && (
        <View style={styles.actions}>
          {autonomyTier === 'guardian' && (
            <TouchableOpacity onPress={handleSend}>
              <Text style={styles.buttonPrimary}>Send</Text>
            </TouchableOpacity>
          )}
          {autonomyTier === 'partner' && countdown !== null && (
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.buttonSecondary}>Cancel ({countdown}s)</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.buttonGhost}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.buttonGhost}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '600' },
  phone: { fontSize: 12, color: '#888' },
  body: { fontSize: 14, color: '#333', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 8, fontSize: 14, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 12 },
  buttonPrimary: { fontSize: 14, fontWeight: '600', color: '#0066cc' },
  buttonSecondary: { fontSize: 14, color: '#cc6600' },
  buttonGhost: { fontSize: 14, color: '#888' },
  successText: { fontSize: 14, color: '#22c55e' },
});
