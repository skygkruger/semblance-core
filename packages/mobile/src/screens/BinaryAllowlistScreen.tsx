// @i18n-pending — hardcoded English text, i18n keys in follow-up pass
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider';

interface AllowlistEntry {
  id: string;
  name: string;
  path: string;
  reason: string;
}

const EXAMPLE_ENTRIES: AllowlistEntry[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    path: '/usr/local/bin/ollama',
    reason: 'Local LLM inference server',
  },
  {
    id: 'bitnet',
    name: 'BitNet.cpp',
    path: '<app-data>/bitnet/bitnet-cli',
    reason: 'CPU-optimized 1-bit model inference',
  },
  {
    id: 'whisper',
    name: 'Whisper.cpp',
    path: '<app-data>/whisper/whisper-cli',
    reason: 'Local speech-to-text transcription',
  },
];

export function BinaryAllowlistScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const semblance = useSemblance();

  if (!semblance.ready) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backText}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Binary Allowlist</Text>
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
        <Text style={styles.title}>Binary Allowlist</Text>
      </View>

      <View style={styles.desktopOnlyCard}>
        <Text style={styles.desktopOnlyTitle}>Desktop-Only Feature</Text>
        <Text style={styles.desktopOnlyBody}>
          The binary allowlist controls which executables Semblance is permitted to run
          on your desktop machine. This is a desktop-only security feature — mobile devices
          do not execute system commands.
        </Text>
      </View>

      <View style={styles.explanationCard}>
        <Text style={styles.explanationTitle}>What is the Binary Allowlist?</Text>
        <Text style={styles.explanationBody}>
          When Semblance needs to run a local tool — like an LLM inference engine, a
          speech-to-text transcriber, or a code formatter — it checks the binary allowlist
          first. Only executables you have explicitly approved can be launched.
        </Text>
        <Text style={styles.explanationBody}>
          This prevents any skill or plugin from executing arbitrary code on your machine.
          Every binary invocation is logged to the append-only audit trail with the full
          command, arguments, and execution context.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Typical Approved Binaries</Text>

      {EXAMPLE_ENTRIES.map((entry) => (
        <View key={entry.id} style={styles.entryCard}>
          <View style={styles.entryHeader}>
            <Text style={styles.entryName}>{entry.name}</Text>
            <View style={styles.exampleBadge}>
              <Text style={styles.exampleBadgeText}>Example</Text>
            </View>
          </View>
          <Text style={styles.entryPath}>{entry.path}</Text>
          <Text style={styles.entryReason}>{entry.reason}</Text>
        </View>
      ))}

      <View style={styles.securityNote}>
        <Text style={styles.securityTitle}>Security Model</Text>
        <Text style={styles.securityBody}>
          Binaries are verified by SHA-256 hash at launch time. If the file on disk does
          not match the hash recorded at approval time, execution is blocked. This defends
          against binary replacement attacks.
        </Text>
        <Text style={styles.securityBody}>
          To add or remove binaries from the allowlist, open Settings on the Semblance
          desktop app and navigate to Trust & Sovereignty.
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
  desktopOnlyCard: {
    marginHorizontal: 24,
    marginBottom: 16,
    backgroundColor: colors.primarySubtleDark,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 16,
  },
  desktopOnlyTitle: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: colors.primary,
    marginBottom: 8,
  },
  desktopOnlyBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
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
    color: colors.textPrimary,
    marginBottom: 8,
  },
  explanationBody: {
    fontFamily: 'DMSans-Light',
    fontSize: 13,
    color: colors.textTertiary,
    lineHeight: 20,
    marginBottom: 8,
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
  entryCard: {
    marginHorizontal: 24,
    marginBottom: 8,
    backgroundColor: colors.surface1Dark,
    borderWidth: 1,
    borderColor: colors.borderDark,
    borderRadius: 12,
    padding: 16,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entryName: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  exampleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surface2Dark,
    borderRadius: 4,
  },
  exampleBadgeText: {
    fontFamily: 'DMSans-Light',
    fontSize: 10,
    color: colors.muted,
  },
  entryPath: {
    fontFamily: 'DMMono-Regular',
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  entryReason: {
    fontFamily: 'DMSans-Light',
    fontSize: 12,
    color: colors.textTertiary,
    lineHeight: 18,
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
    marginBottom: 8,
  },
});

export default BinaryAllowlistScreen;
