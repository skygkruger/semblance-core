import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
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
import { OpalBorderView } from '../../components/OpalBorderView/OpalBorderView.native';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: 1000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return <Animated.View style={[styles.statusDot, { opacity }]} />;
}

export function DataSourcesStep({
  initialConnected = new Set(),
  onContinue,
  onSkip,
}: DataSourcesStepProps) {
  const { t } = useTranslation('onboarding');
  const [connected, setConnected] = useState<Set<string>>(new Set(initialConnected));
  const [showNudge, setShowNudge] = useState(false);

  const SOURCES: DataSource[] = [
    { id: 'email',    name: t('data_sources.sources.email.name'),    description: t('data_sources.sources.email.description'),    icon: EnvelopeIcon },
    { id: 'calendar', name: t('data_sources.sources.calendar.name'), description: t('data_sources.sources.calendar.description'), icon: CalendarIcon },
    { id: 'files',    name: t('data_sources.sources.files.name'),    description: t('data_sources.sources.files.description'),    icon: FolderIcon },
    { id: 'contacts', name: t('data_sources.sources.contacts.name'), description: t('data_sources.sources.contacts.description'), icon: PersonIcon },
    { id: 'health',   name: t('data_sources.sources.health.name'),   description: t('data_sources.sources.health.description'),   icon: HeartIcon },
    { id: 'slack',    name: t('data_sources.sources.slack.name'),    description: t('data_sources.sources.slack.description'),    icon: ChatIcon },
  ];

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
      <Text style={styles.headline}>{t('data_sources.headline')}</Text>
      <Text style={styles.subtext}>
        {t('data_sources.subtext')}
      </Text>

      <View style={styles.grid}>
        {SOURCES.map((source) => {
          const isConnected = connected.has(source.id);
          const Icon = source.icon;
          return (
            <OpalBorderView
              key={source.id}
              borderRadius={10}
              style={isConnected ? styles.cardConnected : undefined}
            >
            <View style={styles.card}>
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
                    <PulsingDot />
                    <Text style={styles.statusText}>{t('data_sources.connected_status')}</Text>
                  </View>
                </Pressable>
              ) : (
                <Button variant="ghost" size="sm" onPress={() => toggleConnect(source.id)}>
                  {t('data_sources.connect_button')}
                </Button>
              )}
            </View>
            </OpalBorderView>
          );
        })}
      </View>

      <Text style={styles.more}>
        {t('data_sources.more_sources')}
      </Text>

      <View style={styles.privacy}>
        <Text style={styles.privacyText}>
          {t('data_sources.privacy_notice')}
        </Text>
      </View>

      {showNudge && (
        <Text style={styles.nudge}>
          {t('data_sources.nudge')}
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable onPress={onSkip} style={styles.skipBtn} hitSlop={8}>
          <Text style={styles.skipText}>{t('data_sources.skip_button')}</Text>
        </Pressable>
        <Button variant="opal" size="md" onPress={handleContinue}>
          {t('data_sources.continue_button')}
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
    fontFamily: nativeFontFamily.mono,
    fontWeight: '200',
    fontSize: nativeFontSize.xl,
    color: brandColors.white,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtext: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: nativeFontSize.base,
    color: brandColors.sv2,
    textAlign: 'center',
    lineHeight: 24,
  },
  grid: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: nativeSpacing.s3,
    gap: nativeSpacing.s3,
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
    fontSize: 14,
    color: '#C8D4E0',
  },
  cardDesc: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: 12,
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
    backgroundColor: 'rgba(110, 207, 163, 0.04)',
    borderRadius: nativeRadius.md,
    paddingHorizontal: nativeSpacing.s4,
    paddingVertical: 10,
  },
  privacyText: {
    fontFamily: nativeFontFamily.ui,
    fontWeight: '300',
    fontSize: 12,
    color: brandColors.sv2,
    lineHeight: 18,
    flex: 1,
  },
  nudge: {
    fontFamily: nativeFontFamily.ui,
    fontSize: nativeFontSize.sm,
    color: brandColors.caution,
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
