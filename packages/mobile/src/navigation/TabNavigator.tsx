// TabNavigator — Bottom tab navigation with per-tab stack navigators.
// 5 tabs: Chat, Inbox, Brief, Knowledge, Settings (matching Storybook MobileTabBar).
// Each tab has its own NativeStack for detail screen navigation.
// All screens from desktop are reachable — secondary screens nest in Settings stack.

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFeatureAuth } from '@semblance/ui';
import { colors, typography, spacing } from '../theme/tokens.js';
import type {
  TabParamList,
  ChatStackParamList,
  InboxStackParamList,
  BriefStackParamList,
  KnowledgeStackParamList,
  SettingsStackParamList,
} from './types.js';

// Screen imports
import { ChatScreen } from '../screens/ChatScreen.js';
import { InboxScreen } from '../screens/InboxScreen.js';
import { BriefScreen } from '../screens/BriefScreen.js';
import { KnowledgeGraphScreen } from '../screens/KnowledgeGraphScreen.js';
import { PrivacyDashboardScreen } from '../screens/privacy/PrivacyDashboardScreen.js';
import { ProofOfPrivacyScreen } from '../screens/privacy/ProofOfPrivacyScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { CaptureScreen } from '../screens/CaptureScreen.js';
import { ImportDigitalLifeScreen } from '../screens/ImportDigitalLifeScreen.js';
import { VoiceSettingsScreen } from '../screens/VoiceSettingsScreen.js';
import { CloudStorageSettingsScreen } from '../screens/CloudStorageSettingsScreen.js';
import { ContactsScreen } from '../screens/ContactsScreen.js';
import { ContactDetailScreen } from '../screens/ContactDetailScreen.js';
import { FinancialDashboardScreen } from '../screens/FinancialDashboardScreen.js';
import { HealthDashboardScreen } from '../screens/HealthDashboardScreen.js';
import { LocationSettingsScreen } from '../screens/LocationSettingsScreen.js';
import { AdversarialDashboardScreen } from '../screens/adversarial/AdversarialDashboardScreen.js';
import { NetworkScreen } from '../screens/sovereignty/NetworkScreen.js';
import { LivingWillScreen } from '../screens/sovereignty/LivingWillScreen.js';
import { WitnessScreen } from '../screens/sovereignty/WitnessScreen.js';
import { InheritanceScreen } from '../screens/sovereignty/InheritanceScreen.js';
import { InheritanceActivationScreen } from '../screens/sovereignty/InheritanceActivationScreen.js';
import { BiometricSetupScreen } from '../screens/security/BiometricSetupScreen.js';
import { BackupScreen } from '../screens/security/BackupScreen.js';
import { fetchKnowledgeGraph } from '../data/knowledge-graph-adapter.js';
import type { KnowledgeGraphData } from '../data/knowledge-graph-adapter.js';

// ─── Stack Navigators ──────────────────────────────────────────────────────

const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const InboxStack = createNativeStackNavigator<InboxStackParamList>();
const BriefStack = createNativeStackNavigator<BriefStackParamList>();
const KnowledgeStack = createNativeStackNavigator<KnowledgeStackParamList>();
const SettingsNavStack = createNativeStackNavigator<SettingsStackParamList>();

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

// ─── Inbox Tab Stack ──────────────────────────────────────────────────────

function InboxTabStack() {
  return (
    <InboxStack.Navigator screenOptions={stackScreenOptions}>
      <InboxStack.Screen name="Inbox" component={InboxScreen} />
    </InboxStack.Navigator>
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

// ─── Screen Wrappers (for screens requiring injected props) ──────────────

function PrivacyDashboardScreenWrapper() {
  const { requireAuth } = useFeatureAuth();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    requireAuth('privacy_dashboard').then((result) => {
      if (!cancelled && result.success) setAuthorized(true);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authorized) {
    return (
      <View style={emptyStateStyles.container}>
        <ActivityIndicator size="large" color="#6ECFA3" />
      </View>
    );
  }

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

function FinancialDashboardScreenWrapper() {
  return (
    <FinancialDashboardScreen
      isPremium
      onActivateDigitalRepresentative={() => {}}
    />
  );
}

function HealthDashboardScreenWrapper() {
  return (
    <HealthDashboardScreen
      isPremium
      onActivateDigitalRepresentative={() => {}}
    />
  );
}

function NetworkScreenWrapper() {
  return (
    <NetworkScreen
      peers={[]}
      activeOffers={[]}
      onAcceptOffer={() => {}}
      onRejectOffer={() => {}}
      onRevokePeer={() => {}}
      onRefresh={() => {}}
    />
  );
}

function LivingWillScreenWrapper() {
  return (
    <LivingWillScreen
      exportStatus={{
        lastExportAt: null,
        lastExportSizeBytes: 0,
        autoExportEnabled: false,
        exportFormat: 'json-ld',
      }}
      isPremium
      onExport={async () => {}}
      onImport={async () => {}}
      onToggleAutoExport={() => {}}
      onChangeFormat={() => {}}
    />
  );
}

function WitnessScreenWrapper() {
  return (
    <WitnessScreen
      attestations={[]}
      isPremium
      onSelectAttestation={() => {}}
      onShareAttestation={async () => {}}
      onVerifyAttestation={async () => ({ valid: true, details: '' })}
    />
  );
}

function InheritanceScreenWrapper() {
  return (
    <InheritanceScreen
      enabled={false}
      trustedParties={[]}
      isPremium
      onToggleEnabled={() => {}}
      onAddParty={() => {}}
      onRemoveParty={() => {}}
      onRunDrill={async () => {}}
    />
  );
}

function InheritanceActivationScreenWrapper() {
  return (
    <InheritanceActivationScreen
      isPremium
      onPickFile={async () => null}
      onActivate={async () => ({ success: false, error: 'Not yet implemented' })}
    />
  );
}

function AdversarialDashboardScreenWrapper() {
  return (
    <AdversarialDashboardScreen
      alerts={[]}
      subscriptions={[]}
      optOutStatus={{ totalOptOuts: 0, pendingOptOuts: 0, successRate: 0 }}
      onDismissAlert={() => {}}
      onReviewSubscription={() => {}}
      onInitiateOptOut={() => {}}
    />
  );
}

function BiometricSetupScreenWrapper() {
  return (
    <BiometricSetupScreen
      isAvailable
      isEnabled={false}
      biometricType="fingerprint"
      lockTimeout="5min"
      sensitiveReconfirm
      onToggleBiometric={() => {}}
      onChangeLockTimeout={() => {}}
      onToggleSensitiveReconfirm={() => {}}
    />
  );
}

function BackupScreenWrapper() {
  return (
    <BackupScreen
      destinations={[]}
      history={[]}
      lastBackupAt={null}
      schedule="manual"
      isBackingUp={false}
      onBackupNow={async () => {}}
      onChangeSchedule={() => {}}
      onAddDestination={() => {}}
      onRemoveDestination={() => {}}
      onRestore={async () => {}}
    />
  );
}

function ProofOfPrivacyScreenWrapper() {
  return (
    <ProofOfPrivacyScreen
      reports={[]}
      isPremium
      isGenerating={false}
      onGenerate={async () => {}}
      onExportReport={async () => {}}
      onViewReport={() => {}}
    />
  );
}

function LocationSettingsScreenWrapper() {
  const [settings, setSettings] = useState({
    enabled: false,
    remindersEnabled: false,
    commuteEnabled: false,
    weatherEnabled: false,
    defaultCity: '',
    retentionDays: 7,
  });
  return (
    <LocationSettingsScreen
      settings={settings}
      onSettingsChange={setSettings}
      onClearHistory={() => {}}
    />
  );
}

// ─── Settings Tab Stack ────────────────────────────────────────────────────

function SettingsTabStack() {
  return (
    <SettingsNavStack.Navigator screenOptions={stackScreenOptions}>
      <SettingsNavStack.Screen name="SettingsRoot" component={SettingsScreen} />
      <SettingsNavStack.Screen name="VoiceSettings" component={VoiceSettingsScreen} />
      <SettingsNavStack.Screen name="CloudStorageSettings" component={CloudStorageSettingsScreen} />
      <SettingsNavStack.Screen name="Capture" component={CaptureScreen} />
      <SettingsNavStack.Screen name="ImportDigitalLife" component={ImportDigitalLifeScreen} />
      <SettingsNavStack.Screen name="Contacts" component={ContactsScreen} />
      <SettingsNavStack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <SettingsNavStack.Screen name="LocationSettings" component={LocationSettingsScreen} />
      <SettingsNavStack.Screen name="FinancialDashboard" component={FinancialDashboardScreenWrapper} />
      <SettingsNavStack.Screen name="HealthDashboard" component={HealthDashboardScreenWrapper} />
      <SettingsNavStack.Screen name="PrivacyDashboard" component={PrivacyDashboardScreenWrapper} />
      <SettingsNavStack.Screen name="ProofOfPrivacy" component={ProofOfPrivacyScreenWrapper} />
      <SettingsNavStack.Screen name="LivingWill" component={LivingWillScreenWrapper} />
      <SettingsNavStack.Screen name="Witness" component={WitnessScreenWrapper} />
      <SettingsNavStack.Screen name="Inheritance" component={InheritanceScreenWrapper} />
      <SettingsNavStack.Screen name="InheritanceActivation" component={InheritanceActivationScreenWrapper} />
      <SettingsNavStack.Screen name="Network" component={NetworkScreenWrapper} />
      <SettingsNavStack.Screen name="BiometricSetup" component={BiometricSetupScreenWrapper} />
      <SettingsNavStack.Screen name="Backup" component={BackupScreenWrapper} />
      <SettingsNavStack.Screen name="AdversarialDashboard" component={AdversarialDashboardScreenWrapper} />
      <SettingsNavStack.Screen name="LocationSettings" component={LocationSettingsScreenWrapper} />
    </SettingsNavStack.Navigator>
  );
}

// ─── Bottom Tab Navigator ──────────────────────────────────────────────────

const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar matching MobileTabBar visual design from Storybook
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Tab display names matching Storybook MobileTabBar story
  const TAB_LABELS: Record<string, string> = {
    ChatTab: 'Chat',
    InboxTab: 'Inbox',
    BriefTab: 'Brief',
    KnowledgeTab: 'Knowledge',
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
            style={[tabStyles.tab, isFocused && tabStyles.tabActive]}
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
        name="InboxTab"
        component={InboxTabStack}
        options={{ tabBarLabel: 'Inbox' }}
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(152,160,168,0.35)',
    backgroundColor: '#111518',
    marginHorizontal: 2,
  },
  tabActive: {
    borderColor: 'rgba(110,207,163,0.35)',
    backgroundColor: 'rgba(110,207,163,0.10)',
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
    fontSize: 10,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
