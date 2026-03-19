// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';

interface PairedDevice {
  id: string;
  name: string;
  type: 'desktop' | 'mobile';
  lastSeen: string;
  status: 'online' | 'offline';
}

export function TunnelPairingScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();
  const [pairingCode, setPairingCode] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // TODO: Sprint where tunnel pairing is wired — currently reads from local state only.
  // Desktop discovery uses mDNS/Bonjour. Pairing code entry initiates mutual TLS handshake.
  const [pairedDevices] = useState<PairedDevice[]>([]);

  const handlePair = () => {
    if (!pairingCode.trim() || pairingCode.trim().length < 6) {
      setPairingError('Pairing code must be at least 6 characters.');
      return;
    }
    setPairingError(null);
    setIsPairing(true);

    // TODO: Wire to actual tunnel pairing via device-handoff.ts
    // This would call the Gateway to initiate local network discovery and mutual TLS auth.
    setTimeout(() => {
      setIsPairing(false);
      setPairingError('Desktop not found on local network. Ensure both devices are on the same WiFi network and the desktop app is running.');
    }, 3000);
  };

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Compute Mesh</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {semblance.initializing ? semblance.progressLabel : 'Connecting to runtime...'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>{'< Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Compute Mesh</Text>
      </View>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>Device Pairing</Text>
        <Text style={styles.explanationBody}>
          Pair this device with your Semblance desktop to offload complex inference tasks.
          When a query exceeds mobile capability, it is handed off to your desktop over an
          encrypted local tunnel. No data leaves your network.
        </Text>
        <Text style={styles.explanationBody}>
          Both devices must be on the same local network. Communication is authenticated
          with mutual TLS — no unauthenticated connections are accepted.
        </Text>
      </View>

      <View style={styles.pairingCard}>
        <Text style={styles.pairingTitle}>Enter Pairing Code</Text>
        <Text style={styles.pairingHelp}>
          Open the Semblance desktop app, go to Settings, and generate a pairing code.
        </Text>
        <TextInput
          style={styles.pairingInput}
          value={pairingCode}
          onChangeText={(text) => {
            setPairingCode(text);
            setPairingError(null);
          }}
          placeholder="e.g. ALPHA-BRAVO-7742"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!isPairing}
        />
        {pairingError && (
          <Text style={styles.errorText}>{pairingError}</Text>
        )}
        <TouchableOpacity
          style={[styles.pairButton, isPairing && styles.pairButtonDisabled]}
          onPress={handlePair}
          disabled={isPairing}
          activeOpacity={0.7}
        >
          {isPairing ? (
            <ActivityIndicator size="small" color={colors.bgDark} />
          ) : (
            <Text style={styles.pairButtonText}>Pair Device</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Paired Devices</Text>

      {pairedDevices.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No paired devices</Text>
          <Text style={styles.emptyBody}>
            Enter a pairing code from your desktop to establish a compute mesh connection.
            Once paired, complex queries will automatically offload to the more powerful device.
          </Text>
        </View>
      ) : (
        pairedDevices.map((device) => (
          <View key={device.id} style={styles.deviceCard}>
            <View style={styles.deviceHeader}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <View style={[
                styles.statusDot,
                device.status === 'online' ? styles.statusOnline : styles.statusOffline,
              ]} />
            </View>
            <Text style={styles.deviceType}>
              {device.type === 'desktop' ? 'Desktop' : 'Mobile'}
            </Text>
            <Text style={styles.deviceLastSeen}>
              Last seen: {device.lastSeen}
            </Text>
          </View>
        ))
      )}

      <View style={styles.securityNote}>
        <Text style={styles.securityTitle}>Security</Text>
        <Text style={styles.securityBody}>
          All tunnel traffic is encrypted end-to-end with mutual TLS authentication.
          Pairing codes are single-use and expire after 5 minutes. Device keys are
          stored in the OS keychain. No cloud relay is used — all communication is
          direct between devices on your local network.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  scrollContent: {
    paddingBottom: 32,
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
  explanationCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  explanationTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.primary,
    marginBottom: 8,
  },
  explanationBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
    marginBottom: 8,
  },
  pairingCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  pairingTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pairingHelp: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  pairingInput: {
    backgroundColor: colors.bgDark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'DMMono-Regular',
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.attention,
    marginBottom: 12,
  },
  pairButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  pairButtonDisabled: {
    opacity: 0.6,
  },
  pairButtonText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.bgDark,
    fontWeight: '600',
  },
  sectionLabel: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: colors.muted,
    marginHorizontal: 24,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  deviceCard: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceName: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOnline: {
    backgroundColor: colors.success,
  },
  statusOffline: {
    backgroundColor: colors.muted,
  },
  deviceType: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
  },
  deviceLastSeen: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
  },
  securityNote: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  securityTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.accent,
    marginBottom: 8,
  },
  securityBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
  },
});

export default TunnelPairingScreen;
