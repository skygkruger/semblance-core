// VoiceSettingsScreen — Mobile voice settings.
// Controls: enable toggle, model info, speed, silence sensitivity.

import React, { useState } from 'react';
import { View, Text, Switch, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/tokens.js';

interface VoiceSettings {
  enabled: boolean;
  whisperModel: string | null;
  piperVoice: string | null;
  speed: number;
  silenceSensitivity: 'low' | 'medium' | 'high';
}

export function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<VoiceSettings>({
    enabled: false,
    whisperModel: null,
    piperVoice: null,
    speed: 1.0,
    silenceSensitivity: 'medium',
  });

  const updateSettings = (partial: Partial<VoiceSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('screen.voice_settings.title')}</Text>

      {/* Enable toggle */}
      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Text style={styles.label}>{t('screen.voice_settings.voice_mode')}</Text>
          <Text style={styles.description}>
            All audio stays on your device and is never saved to disk.
          </Text>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={(value) => updateSettings({ enabled: value })}
          accessibilityLabel={t('a11y.enable_voice_mode')}
        />
      </View>

      {settings.enabled && (
        <>
          {/* STT model status */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('screen.voice_settings.speech_recognition')}</Text>
            <Text style={styles.value}>
              {settings.whisperModel ?? 'Not downloaded'}
            </Text>
          </View>

          {/* TTS voice status */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('screen.voice_settings.voice')}</Text>
            <Text style={styles.value}>
              {settings.piperVoice ?? 'Not downloaded'}
            </Text>
          </View>

          {/* Speed */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('screen.voice_settings.speech_speed')}</Text>
            <Text style={styles.value}>{settings.speed}x</Text>
          </View>

          {/* Sensitivity */}
          <View style={styles.row}>
            <Text style={styles.label}>{t('screen.voice_settings.silence_sensitivity')}</Text>
            <Text style={styles.value}>{settings.silenceSensitivity}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface2Dark,
  },
  labelContainer: {
    flex: 1,
    marginRight: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  description: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  value: {
    fontSize: 14,
    color: colors.textTertiary,
  },
});
