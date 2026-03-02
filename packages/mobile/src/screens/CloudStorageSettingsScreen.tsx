import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

interface CloudStorageSettingsScreenProps {
  onConnect?: (provider: string) => Promise<{ success: boolean; userEmail?: string }>;
  onDisconnect?: (provider: string) => Promise<void>;
  onSyncNow?: () => Promise<{ filesSynced: number; storageUsedBytes: number }>;
}

export function CloudStorageSettingsScreen({
  onConnect,
  onDisconnect,
  onSyncNow,
}: CloudStorageSettingsScreenProps) {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filesSynced, setFilesSynced] = useState(0);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [syncInterval, setSyncInterval] = useState(30);

  const handleConnect = useCallback(async () => {
    if (!onConnect) return;
    setConnecting(true);
    try {
      const result = await onConnect('google_drive');
      if (result.success) {
        setConnected(true);
        setUserEmail(result.userEmail ?? null);
      }
    } finally {
      setConnecting(false);
    }
  }, [onConnect]);

  const handleDisconnect = useCallback(async () => {
    if (!onDisconnect) return;
    await onDisconnect('google_drive');
    setConnected(false);
    setUserEmail(null);
    setFilesSynced(0);
    setStorageUsedBytes(0);
  }, [onDisconnect]);

  const handleSyncNow = useCallback(async () => {
    if (!onSyncNow) return;
    setSyncing(true);
    try {
      const result = await onSyncNow();
      setFilesSynced(result.filesSynced);
      setStorageUsedBytes(result.storageUsedBytes);
    } finally {
      setSyncing(false);
    }
  }, [onSyncNow]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>{t('screen.cloud_storage.title')}</Text>

      {/* Google Drive */}
      <View style={styles.providerCard}>
        <View style={styles.providerInfo}>
          <View style={[styles.statusDot, connected ? styles.statusConnected : styles.statusDisconnected]} />
          <View style={styles.providerText}>
            <Text style={styles.providerName}>{t('screen.cloud_storage.google_drive')}</Text>
            <Text style={styles.providerStatus}>
              {connected ? `Connected as ${userEmail}` : 'Not connected'}
            </Text>
          </View>
        </View>
        {connected ? (
          <TouchableOpacity onPress={handleDisconnect} style={styles.button}>
            <Text style={styles.buttonText}>{t('button.disconnect')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleConnect} disabled={connecting} style={styles.button}>
            <Text style={styles.buttonText}>{connecting ? 'Connecting...' : 'Connect'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {connected && (
        <>
          {/* Storage Usage */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('screen.cloud_storage.storage_used')}</Text>
            <Text style={styles.sectionValue}>{formatBytes(storageUsedBytes)} ({filesSynced} files)</Text>
          </View>

          {/* Sync Interval */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('screen.cloud_storage.sync_interval')}</Text>
            <View style={styles.intervalOptions}>
              {[15, 30, 60].map((min) => (
                <TouchableOpacity
                  key={min}
                  onPress={() => setSyncInterval(min)}
                  style={[styles.intervalButton, syncInterval === min && styles.intervalButtonActive]}
                >
                  <Text style={[styles.intervalText, syncInterval === min && styles.intervalTextActive]}>
                    {min}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sync Now */}
          <TouchableOpacity onPress={handleSyncNow} disabled={syncing} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Coming Soon */}
      {(['Dropbox', 'OneDrive'] as const).map((name) => (
        <View key={name} style={[styles.providerCard, styles.providerDisabled]}>
          <View style={styles.providerInfo}>
            <View style={[styles.statusDot, styles.statusDisconnected]} />
            <View style={styles.providerText}>
              <Text style={styles.providerName}>{name}</Text>
              <Text style={styles.providerStatus}>{t('screen.cloud_storage.coming_soon')}</Text>
            </View>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  providerCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8,
  },
  providerDisabled: { opacity: 0.5 },
  providerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusConnected: { backgroundColor: '#22c55e' },
  statusDisconnected: { backgroundColor: '#d1d5db' },
  providerText: { flex: 1 },
  providerName: { fontSize: 14, fontWeight: '500' },
  providerStatus: { fontSize: 12, color: '#6b7280' },
  button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#e5e7eb' },
  buttonText: { fontSize: 12, fontWeight: '500' },
  section: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionValue: { fontSize: 14, marginTop: 4 },
  intervalOptions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  intervalButton: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f3f4f6' },
  intervalButtonActive: { backgroundColor: '#3b82f6' },
  intervalText: { fontSize: 13, color: '#374151' },
  intervalTextActive: { color: '#fff', fontWeight: '600' },
  syncButton: { marginTop: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#3b82f6', alignItems: 'center' },
  syncButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
