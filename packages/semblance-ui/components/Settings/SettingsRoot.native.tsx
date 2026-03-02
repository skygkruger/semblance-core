import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ChevronRight } from './SettingsIcons';
import type { SettingsScreen, SettingsRootProps } from './SettingsRoot.types';
import { tierLabels, licenseLabels } from './SettingsRoot.types';
import { brandColors, nativeSpacing, nativeRadius, nativeFontSize, nativeFontFamily } from '../../tokens/native';

export type { SettingsScreen };

export function SettingsRoot({
  currentModel,
  activeConnections,
  notificationSummary,
  autonomyTier,
  privacyStatus,
  licenseStatus,
  appVersion,
  onNavigate,
}: SettingsRootProps) {
  const rows: Array<{ screen: SettingsScreen; label: string; value: string }> = [
    { screen: 'ai-engine', label: 'AI Engine', value: currentModel },
    { screen: 'connections', label: 'Connections', value: `${activeConnections} active` },
    { screen: 'notifications', label: 'Notifications', value: notificationSummary },
    { screen: 'autonomy', label: 'Autonomy', value: tierLabels[autonomyTier] || autonomyTier },
    { screen: 'privacy', label: 'Privacy', value: privacyStatus === 'clean' ? 'Audit clean' : 'Review needed' },
    { screen: 'account', label: 'Account', value: licenseLabels[licenseStatus] || licenseStatus },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitleRoot}>Settings</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {rows.map((row) => (
          <Pressable
            key={row.screen}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onNavigate(row.screen)}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue}>{row.value}</Text>
            <View style={styles.rowChevron}>
              <ChevronRight />
            </View>
          </Pressable>
        ))}

        <Text style={styles.footer}>{appVersion}</Text>
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
  headerTitleRoot: {
    fontFamily: nativeFontFamily.display,
    fontWeight: '300',
    fontSize: nativeFontSize.lg,
    color: brandColors.white,
    paddingLeft: nativeSpacing.s1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: nativeSpacing.s8,
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
  rowChevron: {
    flexShrink: 0,
  },
  footer: {
    paddingVertical: nativeSpacing.s6,
    textAlign: 'center',
    fontFamily: nativeFontFamily.mono,
    fontSize: nativeFontSize.xs,
    color: brandColors.sv1,
  },
});
