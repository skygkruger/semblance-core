import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { BackArrow } from './SettingsIcons';
import type { SettingsNotificationsProps } from './SettingsNotifications.types';
import { snoozeLabels, digestLabels } from './SettingsNotifications.types';
import { brandColors, nativeSpacing, nativeFontSize, nativeFontFamily } from '../../tokens/native';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.toggle, on && styles.toggleOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <View style={[styles.toggleThumb, on && styles.toggleThumbOn]} />
    </Pressable>
  );
}

export function SettingsNotifications({
  morningBriefEnabled,
  morningBriefTime,
  includeWeather,
  includeCalendar,
  remindersEnabled,
  defaultSnoozeDuration,
  notifyOnAction,
  notifyOnApproval,
  actionDigest,
  badgeCount,
  soundEffects,
  onChange,
  onBack,
}: SettingsNotificationsProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
          <BackArrow />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Morning Brief */}
        <Text style={styles.sectionHeader}>Morning Brief</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('morningBriefEnabled', !morningBriefEnabled)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Morning Brief enabled</Text>
          <Toggle on={morningBriefEnabled} onToggle={() => onChange('morningBriefEnabled', !morningBriefEnabled)} />
        </Pressable>

        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>Delivery time</Text>
          <Text style={styles.rowValue}>{morningBriefTime}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('includeWeather', !includeWeather)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Include weather</Text>
          <Toggle on={includeWeather} onToggle={() => onChange('includeWeather', !includeWeather)} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('includeCalendar', !includeCalendar)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Include calendar preview</Text>
          <Toggle on={includeCalendar} onToggle={() => onChange('includeCalendar', !includeCalendar)} />
        </Pressable>

        {/* Reminders */}
        <Text style={styles.sectionHeader}>Reminders</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('remindersEnabled', !remindersEnabled)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Reminder notifications</Text>
          <Toggle on={remindersEnabled} onToggle={() => onChange('remindersEnabled', !remindersEnabled)} />
        </Pressable>

        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>Default snooze duration</Text>
          <Text style={styles.rowValue}>{snoozeLabels[defaultSnoozeDuration]}</Text>
        </View>

        {/* Autonomous Actions */}
        <Text style={styles.sectionHeader}>Autonomous Actions</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('notifyOnAction', !notifyOnAction)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Notify when action taken</Text>
          <Toggle on={notifyOnAction} onToggle={() => onChange('notifyOnAction', !notifyOnAction)} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('notifyOnApproval', !notifyOnApproval)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Notify when approval needed</Text>
          <Toggle on={notifyOnApproval} onToggle={() => onChange('notifyOnApproval', !notifyOnApproval)} />
        </Pressable>

        <View style={styles.rowStatic}>
          <Text style={styles.rowLabel}>Action digest</Text>
          <Text style={styles.rowValue}>{digestLabels[actionDigest]}</Text>
        </View>

        {/* System */}
        <Text style={styles.sectionHeader}>System</Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('badgeCount', !badgeCount)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Badge count on app icon</Text>
          <Toggle on={badgeCount} onToggle={() => onChange('badgeCount', !badgeCount)} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => onChange('soundEffects', !soundEffects)}
          accessibilityRole="button"
        >
          <Text style={styles.rowLabel}>Sound effects</Text>
          <Toggle on={soundEffects} onToggle={() => onChange('soundEffects', !soundEffects)} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brandColors.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: nativeSpacing.s4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
    fontSize: 16,
    color: brandColors.white,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: nativeSpacing.s8,
  },
  sectionHeader: {
    paddingTop: nativeSpacing.s5,
    paddingBottom: nativeSpacing.s2,
    paddingHorizontal: nativeSpacing.s5,
    fontSize: nativeFontSize.xs,
    fontWeight: '400',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: brandColors.sv1,
    fontFamily: nativeFontFamily.mono,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: nativeSpacing.s5,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    gap: nativeSpacing.s2,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  rowLabel: {
    flex: 1,
    fontSize: nativeFontSize.base,
    color: brandColors.white,
    fontFamily: nativeFontFamily.ui,
    fontWeight: '400',
  },
  rowValue: {
    fontSize: nativeFontSize.sm,
    color: brandColors.sv3,
    fontFamily: nativeFontFamily.mono,
    marginRight: nativeSpacing.s2,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: brandColors.veridian,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: brandColors.white,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
});
