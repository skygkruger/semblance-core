// LocationSettingsScreen — Mobile equivalent of desktop LocationSettingsSection.
// Toggle: location services (default OFF), sub-toggles, default city, retention, clear history.

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, radius, typographyPresets } from '../theme/tokens.js';

export interface LocationSettingsState {
  enabled: boolean;
  remindersEnabled: boolean;
  commuteEnabled: boolean;
  weatherEnabled: boolean;
  defaultCity: string;
  retentionDays: number;
}

interface LocationSettingsScreenProps {
  settings: LocationSettingsState;
  onSettingsChange: (settings: LocationSettingsState) => void;
  onClearHistory: () => void;
}

const RETENTION_OPTIONS = [1, 3, 7, 14, 30];

export function LocationSettingsScreen({
  settings,
  onSettingsChange,
  onClearHistory,
}: LocationSettingsScreenProps) {
  const update = (partial: Partial<LocationSettingsState>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Location Services</Text>

      {/* Main toggle */}
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Location services</Text>
          <Text style={styles.description}>
            Uses device location for reminders, commute, and weather. All data stays on device.
          </Text>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={(v) => update({ enabled: v })}
          trackColor={{ true: colors.primary }}
        />
      </View>

      {settings.enabled && (
        <View style={styles.subSection}>
          {/* Sub-toggles */}
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Location reminders</Text>
            </View>
            <Switch
              value={settings.remindersEnabled}
              onValueChange={(v) => update({ remindersEnabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Commute alerts</Text>
            </View>
            <Switch
              value={settings.commuteEnabled}
              onValueChange={(v) => update({ commuteEnabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Weather awareness</Text>
            </View>
            <Switch
              value={settings.weatherEnabled}
              onValueChange={(v) => update({ weatherEnabled: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>

          {/* Default city */}
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>Default City</Text>
            <TextInput
              style={styles.input}
              value={settings.defaultCity}
              onChangeText={(text) => update({ defaultCity: text })}
              placeholder="e.g., Portland, OR"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          {/* Retention */}
          <View style={styles.inputSection}>
            <Text style={styles.sectionLabel}>Location History Retention</Text>
            <View style={styles.retentionRow}>
              {RETENTION_OPTIONS.map((days) => (
                <TouchableOpacity
                  key={days}
                  style={[
                    styles.retentionOption,
                    settings.retentionDays === days && styles.retentionOptionActive,
                  ]}
                  onPress={() => update({ retentionDays: days })}
                >
                  <Text
                    style={[
                      styles.retentionText,
                      settings.retentionDays === days && styles.retentionTextActive,
                    ]}
                  >
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Clear history */}
          <TouchableOpacity style={styles.clearButton} onPress={onClearHistory}>
            <Text style={styles.clearButtonText}>Clear location history</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: spacing.md },
  title: { ...typographyPresets.titleLg, color: colors.textPrimary, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowText: { flex: 1, marginRight: spacing.md },
  label: { ...typographyPresets.bodySm, color: colors.textPrimary, fontWeight: '500' },
  description: { ...typographyPresets.bodyXs, color: colors.textTertiary, marginTop: 2 },
  subSection: {
    marginLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
  },
  inputSection: { marginTop: spacing.sm },
  sectionLabel: {
    ...typographyPresets.bodyXs,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: colors.surface1,
  },
  retentionRow: { flexDirection: 'row', gap: spacing.xs },
  retentionOption: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retentionOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  retentionText: { ...typographyPresets.bodyXs, color: colors.textSecondary },
  retentionTextActive: { color: colors.primary, fontWeight: '600' },
  clearButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearButtonText: { ...typographyPresets.bodySm, color: colors.attention },
});
