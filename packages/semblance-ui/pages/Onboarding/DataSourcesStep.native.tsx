import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Button } from '../../components/Button/Button';
import {
  EnvelopeIcon,
  CalendarIcon,
  FolderIcon,
  PersonIcon,
  HeartIcon,
  ChatIcon,
} from '../../components/ConnectionsScreen/ConnectorIcons';
import type { DataSource, DataSourcesStepProps } from './DataSourcesStep.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily, opalSurface } from '../../tokens/native';

const SOURCES: DataSource[] = [
  { id: 'email',    name: 'Email',             description: 'Gmail, Outlook, IMAP',    icon: EnvelopeIcon },
  { id: 'calendar', name: 'Calendar',          description: 'Google, Apple, Outlook',   icon: CalendarIcon },
  { id: 'files',    name: 'Files & Documents', description: 'Local folders, iCloud',    icon: FolderIcon },
  { id: 'contacts', name: 'Contacts',          description: 'Phone, Google, CardDAV',   icon: PersonIcon },
  { id: 'health',   name: 'Health',            description: 'Apple Health, Google Fit',  icon: HeartIcon },
  { id: 'slack',    name: 'Slack',             description: 'Workspace messages',       icon: ChatIcon },
];

export function DataSourcesStep({
  initialConnected = new Set(),
  onContinue,
  onSkip,
}: DataSourcesStepProps) {
  const [connected, setConnected] = useState<Set<string>>(new Set(initialConnected));
  const [showNudge, setShowNudge] = useState(false);

  const toggleConnect = useCallback((id: string) => {
    setConnected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setShowNudge(false);
  }, []);

  const handleContinue = useCallback(() => {
    if (connected.size === 0) {
      setShowNudge(true);
      return;
    }
    onContinue?.(Array.from(connected));
  }, [connected, onContinue]);

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>Connect your world</Text>
      <Text style={styles.subtext}>
        Everything stays on this device. Semblance connects to your accounts
        through the Gateway, fetches your data, and stores it locally.
      </Text>

      <View style={styles.grid}>
        {SOURCES.map((source) => {
          const isConnected = connected.has(source.id);
          const Icon = source.icon;
          return (
            <View
              key={source.id}
              style={[styles.card, isConnected && styles.cardConnected]}
            >
              <View style={styles.cardInfo}>
                <View style={styles.cardIcon}>
                  <Icon size={16} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardName}>{source.name}</Text>
                  <Text style={styles.cardDesc}>{source.description}</Text>
                </View>
              </View>
              {isConnected ? (
                <Pressable onPress={() => toggleConnect(source.id)} hitSlop={8}>
                  <View style={styles.cardStatus}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Connected</Text>
                  </View>
                </Pressable>
              ) : (
                <Button variant="ghost" size="sm" onPress={() => toggleConnect(source.id)}>
                  Connect
                </Button>
              )}
            </View>
          );
        })}
      </View>

      <Text style={styles.more}>
        + 42 more sources available in Connections after setup
      </Text>

      <View style={styles.privacy}>
        <Text style={styles.privacyText}>
          Your data never leaves this device. Connections are encrypted and
          revocable at any time.
        </Text>
      </View>

      {showNudge && (
        <Text style={styles.nudge}>
          Connecting at least one source helps Semblance understand your world.
          You can always add more later.
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onSkip} style={styles.skipBtn} hitSlop={8}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
        <Button variant="approve" size="md" onPress={handleContinue}>
          Continue
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: nativeSpacing.s5,
    gap: nativeSpacing.s4,
  },
  headline: {
    fontFamily: nativeFontFamily.display,
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 20,
  },
  grid: {
    gap: nativeSpacing.s3,
  },
  card: {
    ...opalSurface,
    borderRadius: nativeRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: nativeSpacing.s4,
    minHeight: 56,
  },
  cardConnected: {
    borderLeftWidth: 3,
    borderLeftColor: brandColors.veridian,
  },
  cardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s3,
    flex: 1,
  },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: nativeRadius.md,
    backgroundColor: brandColors.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontFamily: nativeFontFamily.uiMedium,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
  },
  cardDesc: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
  cardStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brandColors.veridian,
  },
  statusText: {
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
  },
  more: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
    textAlign: 'center',
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: nativeSpacing.s2,
    backgroundColor: 'rgba(110, 207, 163, 0.06)',
    borderRadius: nativeRadius.md,
    padding: nativeSpacing.s3,
  },
  privacyText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.xs,
    color: brandColors.veridian,
    lineHeight: 16,
    flex: 1,
  },
  nudge: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.amber,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: nativeSpacing.s4,
    marginTop: nativeSpacing.s2,
  },
  skipBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: nativeSpacing.s4,
  },
  skipText: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.sv1,
  },
});
