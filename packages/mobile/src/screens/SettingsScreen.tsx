// SettingsScreen — All settings from desktop adapted for mobile.
// Wired to the mobile runtime for real model info, autonomy settings, and
// device info. Navigation callbacks push into the Settings stack.
//
// CRITICAL: No network imports. All data is local.

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import type { SettingsStackParamList } from '../navigation/types.js';

type Nav = NativeStackNavigationProp<SettingsStackParamList>;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

export interface SettingsItem {
  id: string;
  label: string;
  description?: string;
  type: 'navigate' | 'toggle' | 'value';
  value?: string | boolean;
  onPress?: () => void;
  onToggle?: (value: boolean) => void;
}

// ─── Settings Row ───────────────────────────────────────────────────────────

function SettingsRow({ item }: { item: SettingsItem }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={item.onPress}
      disabled={item.type === 'toggle'}
      accessibilityRole={item.type === 'toggle' ? 'switch' : 'button'}
    >
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{item.label}</Text>
        {item.description && (
          <Text style={styles.rowDescription}>{item.description}</Text>
        )}
      </View>
      {item.type === 'navigate' && (
        <Text style={styles.chevron}>&gt;</Text>
      )}
      {item.type === 'value' && (
        <Text style={styles.rowValue}>{String(item.value ?? '')}</Text>
      )}
      {item.type === 'toggle' && (
        <Switch
          value={item.value === true}
          onValueChange={item.onToggle}
          trackColor={{ false: colors.surface2Dark, true: colors.primaryActive }}
          thumbColor={item.value ? colors.primary : colors.textTertiary}
        />
      )}
    </TouchableOpacity>
  );
}

// ─── SettingsScreen ─────────────────────────────────────────────────────────

export function SettingsScreen() {
  const { t } = useTranslation();
  const { t: tSettings } = useTranslation('settings');
  const navigation = useNavigation<Nav>();
  const { ready, deviceInfo } = useSemblance();

  // Runtime state
  const [modelName, setModelName] = useState<string>('');
  const [autonomyTier, setAutonomyTier] = useState<string>('partner');
  const [wifiOnly, setWifiOnly] = useState(true);
  const [appVersion] = useState('0.1.0');

  // Load real data from runtime
  useEffect(() => {
    const state = getRuntimeState();

    // Model name from runtime
    if (state.inferenceRouter) {
      const model = state.inferenceRouter.getModelForTask?.('reason') ?? '';
      setModelName(model || 'Not loaded');
    } else if (state.modelManager) {
      setModelName('Not loaded');
    } else {
      setModelName('No inference');
    }

    // Load autonomy tier from persisted mobile preferences
    (async () => {
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const raw = await AsyncStorage.getItem('semblance.autonomy_tier');
        if (raw && ['guardian', 'partner', 'alter_ego'].includes(raw)) {
          setAutonomyTier(raw);
        }
      } catch {
        // AsyncStorage unavailable — keep default 'partner'
      }
    })();
  }, [ready]);

  // Cycle autonomy tier and persist to AsyncStorage
  const handleCycleAutonomyTier = useCallback(async () => {
    const order = ['guardian', 'partner', 'alter_ego'] as const;
    const currentIdx = order.indexOf(autonomyTier as typeof order[number]);
    const next = order[(currentIdx + 1) % order.length] ?? 'partner';
    setAutonomyTier(next);
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('semblance.autonomy_tier', next);
    } catch {
      // Persist failure — tier updated in state only
    }
  }, [autonomyTier]);

  // WiFi-only toggle persists to model manager
  const handleWifiOnlyToggle = useCallback((value: boolean) => {
    setWifiOnly(value);
    const state = getRuntimeState();
    if (state.modelManager) {
      state.modelManager.setWifiOnly?.(value);
    }
  }, []);

  // Build sections with real data and navigation callbacks
  const sections = useMemo<SettingsSection[]>(() => {
    const deviceTier = deviceInfo?.tier ?? 'unknown';
    const ramInfo = deviceInfo ? `${deviceInfo.totalMemMb}MB RAM` : '';
    const platformLabel = deviceInfo?.platform === 'ios' ? 'iOS' : 'Android';

    return [
      {
        title: t('screen.settings.section_ai_engine'),
        items: [
          {
            id: 'model',
            label: tSettings('ai_engine.section_model'),
            type: 'value' as const,
            value: modelName,
          },
          {
            id: 'hardware',
            label: tSettings('ai_engine.section_hardware'),
            type: 'value' as const,
            value: ramInfo ? `${platformLabel} — ${ramInfo} (${deviceTier})` : platformLabel,
          },
          {
            id: 'wifi-only',
            label: 'WiFi-Only Downloads',
            description: undefined,
            type: 'toggle' as const,
            value: wifiOnly,
            onToggle: handleWifiOnlyToggle,
          },
        ],
      },
      {
        title: t('screen.settings.section_autonomy'),
        items: [
          {
            id: 'tier',
            label: tSettings('autonomy.title'),
            type: 'value' as const,
            value: autonomyTier === 'alter_ego'
              ? 'Alter Ego'
              : autonomyTier.charAt(0).toUpperCase() + autonomyTier.slice(1),
            onPress: handleCycleAutonomyTier,
          },
          {
            id: 'intents',
            label: t('screen.settings.intents_hard_limits'),
            type: 'navigate' as const,
            description: tSettings('intents_hard_limits_subtitle'),
            onPress: () => navigation.navigate('Intent'),
          },
        ],
      },
      {
        title: t('nav.connections'),
        items: [
          {
            id: 'connections',
            label: t('screen.connections.title'),
            type: 'navigate' as const,
            description: t('screen.connections.subtitle'),
            onPress: () => navigation.navigate('Connections'),
          },
          {
            id: 'files',
            label: t('screen.files.title'),
            type: 'navigate' as const,
            description: t('screen.files.section_directories'),
            onPress: () => navigation.navigate('Files'),
          },
          {
            id: 'import',
            label: t('screen.import_life.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('ImportDigitalLife'),
          },
        ],
      },
      {
        title: 'Features',
        items: [
          {
            id: 'voice',
            label: t('screen.voice_settings.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('VoiceSettings'),
          },
          {
            id: 'cloud-storage',
            label: t('screen.cloud_storage.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('CloudStorageSettings'),
          },
          {
            id: 'location',
            label: t('screen.location.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('LocationSettings'),
          },
          {
            id: 'search',
            label: t('screen.search_settings.title', { defaultValue: 'Search' }),
            type: 'navigate' as const,
            description: t('screen.search_settings.nav_description', { defaultValue: 'Search engine and API keys' }),
            onPress: () => navigation.navigate('SearchSettings'),
          },
          {
            id: 'capture',
            label: t('screen.capture.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('Capture'),
          },
        ],
      },
      {
        title: 'Your Digital Twin',
        items: [
          {
            id: 'living-will',
            label: t('screen.living_will.title'),
            type: 'navigate' as const,
            description: t('screen.living_will.subtitle'),
            onPress: () => navigation.navigate('LivingWill'),
          },
          {
            id: 'witness',
            label: t('screen.witness.title'),
            type: 'navigate' as const,
            description: t('screen.witness.subtitle'),
            onPress: () => navigation.navigate('Witness', {}),
          },
          {
            id: 'inheritance',
            label: t('screen.inheritance.title'),
            type: 'navigate' as const,
            description: t('screen.inheritance.subtitle'),
            onPress: () => navigation.navigate('Inheritance'),
          },
          {
            id: 'semblance-network',
            label: t('screen.semblance_network.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('Network'),
          },
        ],
      },
      {
        title: 'Security',
        items: [
          {
            id: 'biometric',
            label: t('screen.biometric.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('BiometricSetup'),
          },
          {
            id: 'backup',
            label: t('screen.backup.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('Backup'),
          },
        ],
      },
      {
        title: 'Privacy',
        items: [
          {
            id: 'privacy-dashboard',
            label: tSettings('privacy.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('PrivacyDashboard'),
          },
          {
            id: 'adversarial',
            label: t('screen.adversarial.title'),
            type: 'navigate' as const,
            onPress: () => navigation.navigate('AdversarialDashboard'),
          },
          {
            id: 'activity',
            label: t('screen.activity.title'),
            type: 'navigate' as const,
            description: t('screen.activity.empty', { name: 'Semblance' }).slice(0, 45) + '...',
            onPress: () => navigation.navigate('Activity'),
          },
        ],
      },
      {
        title: t('screen.settings.section_about'),
        items: [
          {
            id: 'version',
            label: t('screen.settings.about_version'),
            type: 'value' as const,
            value: `v${appVersion}`,
          },
          {
            id: 'license',
            label: t('screen.settings.about_license'),
            type: 'value' as const,
            value: '',
          },
        ],
      },
    ];
  }, [
    t, tSettings, navigation, modelName, autonomyTier, wifiOnly,
    deviceInfo, handleWifiOnlyToggle, handleCycleAutonomyTier, appVersion,
  ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>{t('screen.settings.title')}</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, i) => (
              <React.Fragment key={item.id}>
                {i > 0 && <View style={styles.separator} />}
                <SettingsRow item={item} />
              </React.Fragment>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  screenTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondaryDark,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionCard: {
    backgroundColor: colors.surface1Dark,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDark,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
  },
  rowDescription: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    marginRight: spacing.sm,
  },
  chevron: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textTertiary,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderDark,
    marginLeft: spacing.base,
  },
});
