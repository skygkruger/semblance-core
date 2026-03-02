// TabNavigator — Bottom tab navigation with per-tab stack navigators.
// 5 tabs: Chat, Brief, Knowledge, Privacy, Settings.
// Each tab has its own NativeStack for detail screen navigation.
// Phase 6: All tabs wired to real screen implementations.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../theme/tokens.js';
import type {
  TabParamList,
  ChatStackParamList,
  BriefStackParamList,
  KnowledgeStackParamList,
  PrivacyStackParamList,
  SettingsStackParamList,
} from './types.js';

// Screen imports
import { ChatScreen } from '../screens/ChatScreen.js';
import { BriefScreen } from '../screens/BriefScreen.js';
import { KnowledgeGraphScreen } from '../screens/KnowledgeGraphScreen.js';
import { PrivacyDashboardScreen } from '../screens/privacy/PrivacyDashboardScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { CaptureScreen } from '../screens/CaptureScreen.js';
import { ImportDigitalLifeScreen } from '../screens/ImportDigitalLifeScreen.js';
import { VoiceSettingsScreen } from '../screens/VoiceSettingsScreen.js';
import { CloudStorageSettingsScreen } from '../screens/CloudStorageSettingsScreen.js';
import { fetchKnowledgeGraph } from '../data/knowledge-graph-adapter.js';
import type { KnowledgeGraphData } from '../data/knowledge-graph-adapter.js';

// ─── Stack Navigators ──────────────────────────────────────────────────────

const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const BriefStack = createNativeStackNavigator<BriefStackParamList>();
const KnowledgeStack = createNativeStackNavigator<KnowledgeStackParamList>();
const PrivacyStack = createNativeStackNavigator<PrivacyStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const stackScreenOptions = {
  headerShown: false as const,
  contentStyle: { backgroundColor: colors.bgDark },
};

// ─── Chat Tab Stack ────────────────────────────────────────────────────────

function ChatTabStack() {
  return (
    <ChatStack.Navigator screenOptions={stackScreenOptions}>
      <ChatStack.Screen name="Chat" component={ChatScreen} />
    </ChatStack.Navigator>
  );
}

// ─── Brief Tab Stack ───────────────────────────────────────────────────────

function BriefTabStack() {
  return (
    <BriefStack.Navigator screenOptions={stackScreenOptions}>
      <BriefStack.Screen name="Brief" component={BriefScreen} />
    </BriefStack.Navigator>
  );
}

// ─── Knowledge Tab Stack ───────────────────────────────────────────────────

// Wrapper — fetches graph data via adapter and renders screen or empty state
function KnowledgeGraphScreenWrapper() {
  const [data, setData] = useState<KnowledgeGraphData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchKnowledgeGraph().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <View style={emptyStateStyles.container}>
        <ActivityIndicator size="large" color="#6ECFA3" />
        <Text style={emptyStateStyles.loadingText}>Loading knowledge graph...</Text>
      </View>
    );
  }

  if (data?.isEmpty) {
    return (
      <View style={emptyStateStyles.container}>
        <Text style={emptyStateStyles.title}>Knowledge Graph</Text>
        <Text style={emptyStateStyles.message}>
          Connect data sources to build your knowledge graph. Semblance maps
          the people, topics, and events across your digital life.
        </Text>
        <Text style={emptyStateStyles.cta}>
          Settings → Import Digital Life to get started.
        </Text>
      </View>
    );
  }

  return <KnowledgeGraphScreen graph={data!.graph} />;
}

function KnowledgeTabStack() {
  return (
    <KnowledgeStack.Navigator screenOptions={stackScreenOptions}>
      <KnowledgeStack.Screen name="KnowledgeGraph" component={KnowledgeGraphScreenWrapper} />
      <KnowledgeStack.Screen name="ImportDigitalLife" component={ImportDigitalLifeScreen} />
    </KnowledgeStack.Navigator>
  );
}

// ─── Privacy Tab Stack ─────────────────────────────────────────────────────

// Wrapper to provide default props for PrivacyDashboardScreen
function PrivacyDashboardScreenWrapper() {
  // TODO: Sprint 5 — wire to real privacy data from Core
  return (
    <PrivacyDashboardScreen
      guarantees={[
        { id: 'local-only', label: 'All data local', description: 'Your data never leaves this device', verified: true },
        { id: 'no-telemetry', label: 'Zero telemetry', description: 'No analytics, no crash reporting, no tracking', verified: true },
        { id: 'no-cloud', label: 'No cloud sync', description: 'Storage is device-only by design', verified: true },
        { id: 'open-audit', label: 'Open audit trail', description: 'Every action logged and reviewable', verified: true },
      ]}
      dataInventory={[]}
      networkActivity={[]}
      comparison={{ localOnlyDataPoints: 0, cloudCompetitorDataPoints: 0, actionsLogged: 0, actionsReversible: 0 }}
      auditTrailSize={0}
      onNavigateToProofOfPrivacy={() => {}}
      onNavigateToNetworkMonitor={() => {}}
    />
  );
}

function PrivacyTabStack() {
  return (
    <PrivacyStack.Navigator screenOptions={stackScreenOptions}>
      <PrivacyStack.Screen name="PrivacyDashboard" component={PrivacyDashboardScreenWrapper} />
    </PrivacyStack.Navigator>
  );
}

// ─── Settings Tab Stack ────────────────────────────────────────────────────

function SettingsTabStack() {
  return (
    <SettingsStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsStack.Screen name="SettingsRoot" component={SettingsScreen} />
      <SettingsStack.Screen name="VoiceSettings" component={VoiceSettingsScreen} />
      <SettingsStack.Screen name="CloudStorageSettings" component={CloudStorageSettingsScreen} />
      <SettingsStack.Screen name="Capture" component={CaptureScreen} />
      <SettingsStack.Screen name="ImportDigitalLife" component={ImportDigitalLifeScreen} />
    </SettingsStack.Navigator>
  );
}

// ─── Bottom Tab Navigator ──────────────────────────────────────────────────

const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar matching MobileTabBar visual design
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Tab display names
  const TAB_LABELS: Record<string, string> = {
    ChatTab: 'Chat',
    BriefTab: 'Brief',
    KnowledgeTab: 'Knowledge',
    PrivacyTab: 'Privacy',
    SettingsTab: 'Settings',
  };

  return (
    <View style={[tabStyles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const label = (options.tabBarLabel as string | undefined) ?? TAB_LABELS[route.name] ?? route.name;
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
            style={tabStyles.tab}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={label}
          >
            <View style={[tabStyles.indicator, isFocused && tabStyles.indicatorActive]} />
            <Text style={[tabStyles.tabLabel, isFocused && tabStyles.tabLabelActive]}>
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
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen
        name="ChatTab"
        component={ChatTabStack}
        options={{ tabBarLabel: 'Chat' }}
      />
      <Tab.Screen
        name="BriefTab"
        component={BriefTabStack}
        options={{ tabBarLabel: 'Brief' }}
      />
      <Tab.Screen
        name="KnowledgeTab"
        component={KnowledgeTabStack}
        options={{ tabBarLabel: 'Knowledge' }}
      />
      <Tab.Screen
        name="PrivacyTab"
        component={PrivacyTabStack}
        options={{ tabBarLabel: 'Privacy' }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsTabStack}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

// Keep SimpleTabView export for backward compatibility with tests
export { MainTabNavigator as SimpleTabView };

const tabStyles = StyleSheet.create({
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

const emptyStateStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginTop: spacing.md,
  },
  title: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimaryDark,
    marginBottom: spacing.md,
  },
  message: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  cta: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: '#6ECFA3',
    textAlign: 'center',
  },
});
