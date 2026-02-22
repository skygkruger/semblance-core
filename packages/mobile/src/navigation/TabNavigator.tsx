// TabNavigator — Bottom tab navigation for the main app.
// Tabs: Inbox, Chat, Capture, Settings.
// Uses design system colors and typography.
//
// Note: This component depends on @react-navigation/bottom-tabs which is
// a React Native library. In test environments, we render screens directly.

import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { colors, typography, spacing } from '../theme/tokens.js';
import type { TabParamList } from './types.js';

import { InboxScreen } from '../screens/InboxScreen.js';
import { ChatScreen } from '../screens/ChatScreen.js';
import { CaptureScreen } from '../screens/CaptureScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';

// Tab configuration for the bottom navigation
export const TAB_CONFIG: Array<{
  name: keyof TabParamList;
  label: string;
  screen: React.ComponentType;
}> = [
  { name: 'Inbox', label: 'Inbox', screen: InboxScreen },
  { name: 'Chat', label: 'Chat', screen: ChatScreen },
  { name: 'Capture', label: 'Capture', screen: CaptureScreen },
  { name: 'Settings', label: 'Settings', screen: SettingsScreen },
];

// Tab bar style configuration following DESIGN_SYSTEM.md
export const TAB_BAR_STYLE = {
  backgroundColor: colors.surface1Dark,
  borderTopColor: colors.borderDark,
  borderTopWidth: 1,
  paddingBottom: spacing.sm,
  paddingTop: spacing.sm,
  height: 60,
};

export const TAB_BAR_LABEL_STYLE = {
  fontFamily: typography.fontBody,
  fontSize: typography.size.xs,
  fontWeight: typography.weight.medium as '500',
};

export const TAB_BAR_COLORS = {
  activeTintColor: colors.primary,
  inactiveTintColor: colors.textTertiary,
};

/**
 * Simplified tab view for environments without React Navigation.
 * Full navigation integration happens when running in React Native.
 */
export function SimpleTabView({ activeTab = 'Inbox' }: { activeTab?: keyof TabParamList }) {
  const tab = TAB_CONFIG.find(t => t.name === activeTab);
  const Screen = tab?.screen ?? InboxScreen;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Screen />
      </View>
      <View style={styles.tabBar}>
        {TAB_CONFIG.map(t => (
          <View key={t.name} style={styles.tab}>
            <Text
              style={[
                styles.tabLabel,
                t.name === activeTab && styles.tabLabelActive,
              ]}
            >
              {t.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface1Dark,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    paddingVertical: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  tabLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
});
