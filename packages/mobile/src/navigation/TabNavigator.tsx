// TabNavigator — Bottom tab navigation for the main app.
// 5 tabs: Chat, Brief, Knowledge, Privacy, Settings.
// Uses @react-navigation/bottom-tabs with custom tab bar styling.

import React from 'react';
import { StyleSheet, View, Text, Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../theme/tokens.js';
import type { TabParamList } from './types.js';

import { ChatScreen } from '../screens/ChatScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';

// Placeholder screens for tabs that will be wired in Phase 6
function BriefScreen() {
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Morning Brief</Text>
      <Text style={placeholderStyles.sub}>Loading...</Text>
    </View>
  );
}

function KnowledgeScreen() {
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Knowledge Graph</Text>
      <Text style={placeholderStyles.sub}>Loading...</Text>
    </View>
  );
}

function PrivacyScreen() {
  return (
    <View style={placeholderStyles.container}>
      <Text style={placeholderStyles.text}>Privacy Dashboard</Text>
      <Text style={placeholderStyles.sub}>Loading...</Text>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.lg,
    color: colors.textPrimaryDark,
  },
  sub: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
});

const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar matching MobileTabBar visual design
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const label = options.tabBarLabel as string ?? route.name;
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={label}
          >
            <View style={[styles.indicator, isFocused && styles.indicatorActive]} />
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="Brief"
        component={BriefScreen}
        options={{ tabBarLabel: 'Brief' }}
      />
      <Tab.Screen
        name="Knowledge"
        component={KnowledgeScreen}
        options={{ tabBarLabel: 'Knowledge' }}
      />
      <Tab.Screen
        name="Privacy"
        component={PrivacyScreen}
        options={{ tabBarLabel: 'Privacy' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

// Keep SimpleTabView export for backward compatibility with tests
export { MainTabNavigator as SimpleTabView };

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface1Dark,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  indicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
    marginBottom: 4,
  },
  indicatorActive: {
    backgroundColor: '#6ECFA3',
  },
  tabLabel: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  tabLabelActive: {
    color: '#6ECFA3',
    fontWeight: typography.weight.medium,
  },
});
