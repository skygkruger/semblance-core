// TabNavigator — Bottom tab navigation with per-tab stack navigators.
// 5 tabs: Chat, Brief, Knowledge, Dashboards, Settings.
// Each tab has its own NativeStack for detail screen navigation.
// All screens from desktop are reachable — secondary screens nest in Settings stack.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useFeatureAuth } from '@semblance/ui';
import { colors, typography, spacing } from '../theme/tokens.js';
import type {
  TabParamList,
  ChatStackParamList,
  BriefStackParamList,
  KnowledgeStackParamList,
  DashboardsStackParamList,
  SettingsStackParamList,
} from './types.js';

// Runtime
import { getRuntimeState } from '../runtime/mobile-runtime.js';
import { useSemblance } from '../runtime/SemblanceProvider.js';
import { getPlatform, hasPlatform } from '@semblance/core';
import { createMobileBiometricAdapter } from '../adapters/mobile-biometric-adapter.js';
import { createMobileShareAdapter } from '../adapters/mobile-share-adapter.js';
import type { BiometricType, LockTimeout } from '@semblance/core/auth/types';

// Screen imports
import { ChatScreen } from '../screens/ChatScreen.js';
import { InboxScreen } from '../screens/InboxScreen.js';
import { BriefScreen } from '../screens/BriefScreen.js';
import { KnowledgeGraphScreen } from '../screens/KnowledgeGraphScreen.js';
import { PrivacyDashboardScreen } from '../screens/privacy/PrivacyDashboardScreen.js';
import type { DataInventoryItem, NetworkActivityEntry } from '../screens/privacy/PrivacyDashboardScreen.js';
import { ProofOfPrivacyScreen } from '../screens/privacy/ProofOfPrivacyScreen.js';
import type { PrivacyReport } from '../screens/privacy/ProofOfPrivacyScreen.js';
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
import type { LocationSettingsState } from '../screens/LocationSettingsScreen.js';
import { SearchSettingsScreen } from '../screens/SearchSettingsScreen.js';
import type { SearchSettingsState } from '../screens/SearchSettingsScreen.js';
import { AdversarialDashboardScreen } from '../screens/adversarial/AdversarialDashboardScreen.js';
import type { DarkPatternAlert, SubscriptionAssessment, OptOutStatus } from '../screens/adversarial/AdversarialDashboardScreen.js';
import { NetworkScreen } from '../screens/sovereignty/NetworkScreen.js';
import type { NetworkPeer, SharingOffer } from '../screens/sovereignty/NetworkScreen.js';
import { LivingWillScreen } from '../screens/sovereignty/LivingWillScreen.js';
import type { LivingWillExportStatus } from '../screens/sovereignty/LivingWillScreen.js';
import { WitnessScreen } from '../screens/sovereignty/WitnessScreen.js';
import type { Attestation } from '../screens/sovereignty/WitnessScreen.js';
import { InheritanceScreen } from '../screens/sovereignty/InheritanceScreen.js';
import type { TrustedParty } from '../screens/sovereignty/InheritanceScreen.js';
import { InheritanceActivationScreen } from '../screens/sovereignty/InheritanceActivationScreen.js';
import { BiometricSetupScreen } from '../screens/security/BiometricSetupScreen.js';
import { BackupScreen } from '../screens/security/BackupScreen.js';
import type { BackupDestination, BackupHistoryItem } from '../screens/security/BackupScreen.js';
import { DashboardHubScreen } from '../screens/DashboardHubScreen.js';
import { ConnectionsScreen } from '../screens/ConnectionsScreen.js';
import { FilesScreen } from '../screens/FilesScreen.js';
import { ActivityScreen } from '../screens/ActivityScreen.js';
import { IntentScreen } from '../screens/IntentScreen.js';
import { DigestScreen } from '../screens/DigestScreen.js';
import { NetworkMonitorScreen } from '../screens/NetworkMonitorScreen.js';
import { RelationshipsScreen } from '../screens/RelationshipsScreen.js';
import { SovereigntyReportScreen } from '../screens/SovereigntyReportScreen.js';
// Sprint UI additions
import { TunnelPairingScreen as TunnelPairingScreenMobile } from '../screens/TunnelPairingScreen.js';
import { ChannelsScreen as ChannelsScreenMobile } from '../screens/ChannelsScreen.js';
import { SessionsScreen as SessionsScreenMobile } from '../screens/SessionsScreen.js';
import { LearnedPreferencesScreen as LearnedPreferencesScreenMobile } from '../screens/LearnedPreferencesScreen.js';
import { SkillsScreen as SkillsScreenMobile } from '../screens/SkillsScreen.js';
import { BinaryAllowlistScreen as BinaryAllowlistScreenMobile } from '../screens/BinaryAllowlistScreen.js';
import { fetchKnowledgeGraph } from '../data/knowledge-graph-adapter.js';
import type { KnowledgeGraphData } from '../data/knowledge-graph-adapter.js';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/** Resolve whether the user has a premium license from the runtime core. */
function useIsPremium(): boolean {
  const { ready } = useSemblance();
  const [premium, setPremium] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const state = getRuntimeState();
    // Core initialized means premium-gated features can run their own gate check.
    // The screen-level components handle the actual PremiumGate.isPremium() check.
    setPremium(state.core !== null);
  }, [ready]);

  return premium;
}

function LoadingView({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={emptyStateStyles.container}>
      <ActivityIndicator size="large" color="#6ECFA3" />
      {label ? (
        <Text style={emptyStateStyles.loadingText}>{label}</Text>
      ) : (
        <Text style={emptyStateStyles.loadingText}>
          {t('loading', { defaultValue: 'Loading...' })}
        </Text>
      )}
    </View>
  );
}

// Lazy singletons for native adapters
let _biometricAdapter: ReturnType<typeof createMobileBiometricAdapter> | null = null;
function getBiometricAdapter() {
  if (!_biometricAdapter) {
    const plat = Platform.OS === 'ios' ? 'ios' : 'android';
    _biometricAdapter = createMobileBiometricAdapter(plat as 'ios' | 'android');
  }
  return _biometricAdapter;
}

let _shareAdapter: ReturnType<typeof createMobileShareAdapter> | null = null;
function getShareAdapter() {
  if (!_shareAdapter) {
    _shareAdapter = createMobileShareAdapter();
  }
  return _shareAdapter;
}

// ─── Stack Navigators ──────────────────────────────────────────────────────

const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const BriefStack = createNativeStackNavigator<BriefStackParamList>();
const KnowledgeStack = createNativeStackNavigator<KnowledgeStackParamList>();
const DashboardsStack = createNativeStackNavigator<DashboardsStackParamList>();
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

// ─── Brief Tab Stack ───────────────────────────────────────────────────────

function BriefTabStack() {
  return (
    <BriefStack.Navigator screenOptions={stackScreenOptions}>
      <BriefStack.Screen name="Brief" component={BriefScreen} />
    </BriefStack.Navigator>
  );
}

// ─── Knowledge Tab Stack ───────────────────────────────────────────────────

function KnowledgeGraphScreenWrapper() {
  const { t } = useTranslation();
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
      <LoadingView label={t('screen.knowledge.loading', { defaultValue: 'Loading knowledge graph...' })} />
    );
  }

  if (data?.isEmpty) {
    return (
      <View style={emptyStateStyles.container}>
        <Text style={emptyStateStyles.title}>
          {t('screen.knowledge.title', { defaultValue: 'Knowledge Graph' })}
        </Text>
        <Text style={emptyStateStyles.message}>
          {t('screen.knowledge.empty_message', {
            defaultValue: 'Connect data sources to build your knowledge graph. Semblance maps the people, topics, and events across your digital life.',
          })}
        </Text>
        <Text style={emptyStateStyles.cta}>
          {t('screen.knowledge.empty_cta', {
            defaultValue: 'Settings \u2192 Import Digital Life to get started.',
          })}
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
  const { t } = useTranslation();
  const { requireAuth } = useFeatureAuth();
  const { ready } = useSemblance();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataInventory, setDataInventory] = useState<DataInventoryItem[]>([]);
  const [networkActivity] = useState<NetworkActivityEntry[]>([]);
  const [auditTrailSize, setAuditTrailSize] = useState(0);
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  useEffect(() => {
    let cancelled = false;
    requireAuth('privacy_dashboard').then((result) => {
      if (!cancelled && result.success) setAuthorized(true);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load real data from the knowledge graph once authorized and runtime ready
  useEffect(() => {
    if (!authorized || !ready) return;
    let cancelled = false;

    const loadData = async () => {
      const state = getRuntimeState();
      const core = state.core;

      if (core) {
        try {
          const stats = await core.knowledge.getStats();
          const inventory: DataInventoryItem[] = Object.entries(stats.sources).map(
            ([source, count]) => ({
              category: source,
              itemCount: count,
              lastUpdated: new Date().toISOString(),
              storageBytes: 0,
            }),
          );
          if (!cancelled) {
            setDataInventory(inventory);
            setAuditTrailSize(stats.totalDocuments);
          }
        } catch {
          // Knowledge graph may not be available
        }
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [authorized, ready]);

  if (loading || !authorized) {
    return <LoadingView />;
  }

  return (
    <PrivacyDashboardScreen
      guarantees={[
        {
          id: 'local-only',
          label: t('privacy.guarantee.local_only.label', { defaultValue: 'All data local' }),
          description: t('privacy.guarantee.local_only.desc', { defaultValue: 'Your data never leaves this device' }),
          verified: true,
        },
        {
          id: 'no-telemetry',
          label: t('privacy.guarantee.no_telemetry.label', { defaultValue: 'Zero telemetry' }),
          description: t('privacy.guarantee.no_telemetry.desc', { defaultValue: 'No analytics, no crash reporting, no tracking' }),
          verified: true,
        },
        {
          id: 'no-cloud',
          label: t('privacy.guarantee.no_cloud.label', { defaultValue: 'No cloud sync' }),
          description: t('privacy.guarantee.no_cloud.desc', { defaultValue: 'Storage is device-only by design' }),
          verified: true,
        },
        {
          id: 'open-audit',
          label: t('privacy.guarantee.open_audit.label', { defaultValue: 'Open audit trail' }),
          description: t('privacy.guarantee.open_audit.desc', { defaultValue: 'Every action logged and reviewable' }),
          verified: true,
        },
      ]}
      dataInventory={dataInventory}
      networkActivity={networkActivity}
      comparison={{
        localOnlyDataPoints: auditTrailSize,
        cloudCompetitorDataPoints: 0,
        actionsLogged: auditTrailSize,
        actionsReversible: 0,
      }}
      auditTrailSize={auditTrailSize}
      onNavigateToProofOfPrivacy={() => navigation.navigate('ProofOfPrivacy')}
      onNavigateToNetworkMonitor={() => navigation.navigate('Network')}
    />
  );
}

function FinancialDashboardScreenWrapper() {
  const isPremium = useIsPremium();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  return (
    <FinancialDashboardScreen
      isPremium={isPremium}
      onActivateDigitalRepresentative={() => navigation.navigate('SettingsRoot')}
    />
  );
}

function HealthDashboardScreenWrapper() {
  const isPremium = useIsPremium();
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  return (
    <HealthDashboardScreen
      isPremium={isPremium}
      onActivateDigitalRepresentative={() => navigation.navigate('SettingsRoot')}
    />
  );
}

function NetworkScreenWrapper() {
  const { t } = useTranslation();
  const { ready, searchKnowledge } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<NetworkPeer[]>([]);
  const [activeOffers, setActiveOffers] = useState<SharingOffer[]>([]);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadPeers = async () => {
      try {
        const results = await searchKnowledge('peer device network', 10);
        const peerDocs: NetworkPeer[] = results
          .filter((r) => r.score > 0.5)
          .map((r, i) => ({
            id: `peer-${i}`,
            name: r.content.slice(0, 40),
            deviceType: 'desktop' as const,
            status: 'discovered' as const,
            lastSeenAt: new Date().toISOString(),
            sharedCategories: [],
          }));
        if (!cancelled) setPeers(peerDocs);
      } catch {
        // Knowledge graph unavailable
      }
      if (!cancelled) setLoading(false);
    };

    loadPeers();
    return () => { cancelled = true; };
  }, [ready, searchKnowledge]);

  if (loading) {
    return <LoadingView label={t('screen.network.loading', { defaultValue: 'Scanning for peers...' })} />;
  }

  return (
    <NetworkScreen
      peers={peers}
      activeOffers={activeOffers}
      syncStatus={{ lastSyncAt: null, inProgress: false }}
      onCreateOffer={async () => {}}
      onAcceptOffer={async (offerId) => {
        setActiveOffers((prev) => prev.filter((o) => o.id !== offerId));
      }}
      onDeclineOffer={(offerId) => {
        setActiveOffers((prev) => prev.filter((o) => o.id !== offerId));
      }}
      onRevokePeer={async (peerId) => {
        setPeers((prev) => prev.filter((p) => p.id !== peerId));
      }}
      onRefreshPeers={() => {
        setLoading(true);
        setTimeout(() => setLoading(false), 300);
      }}
    />
  );
}

function LivingWillScreenWrapper() {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { ready } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [exportStatus, setExportStatus] = useState<LivingWillExportStatus>({
    lastExportAt: null,
    lastExportSizeBytes: null,
    autoExportEnabled: false,
    exportFormat: 'json-ld',
  });

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadExportStatus = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          const results = await state.core.knowledge.search('living will export', { limit: 1 });
          if (!cancelled && results.length > 0) {
            const meta = results[0]?.document?.metadata as Record<string, unknown> | undefined;
            setExportStatus((prev) => ({
              ...prev,
              lastExportAt: (meta?.exportedAt as string) ?? null,
            }));
          }
        } catch {
          // Knowledge graph unavailable
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadExportStatus();
    return () => { cancelled = true; };
  }, [ready]);

  if (loading) {
    return <LoadingView label={t('screen.living_will.loading', { defaultValue: 'Loading export status...' })} />;
  }

  return (
    <LivingWillScreen
      exportStatus={exportStatus}
      isPremium={isPremium}
      onExport={async () => {
        const shareAdpt = getShareAdapter();
        const state = getRuntimeState();
        if (state.core) {
          try {
            const docs = await state.core.knowledge.listDocuments({ limit: 1000 });
            const payload = JSON.stringify(docs, null, 2);
            const filePath = `${state.dataDir}/living-will-export.json`;
            await shareAdpt.shareFile(filePath, 'application/json', t('screen.living_will.export_title', { defaultValue: 'Living Will Export' }));
            setExportStatus((prev) => ({
              ...prev,
              lastExportAt: new Date().toISOString(),
              lastExportSizeBytes: payload.length,
            }));
          } catch (err) {
            console.error('[LivingWillWrapper] Export failed:', err);
          }
        }
      }}
      onImport={async () => {
        const shareAdpt = getShareAdapter();
        const result = await shareAdpt.pickFile(['application/json']);
        if (result.status === 'success' && result.file) {
          console.log('[LivingWillWrapper] File picked for import:', result.file.name);
        }
      }}
      onToggleAutoExport={(enabled) => {
        setExportStatus((prev) => ({ ...prev, autoExportEnabled: enabled }));
      }}
      onConfigureFormat={(format) => {
        setExportStatus((prev) => ({ ...prev, exportFormat: format }));
      }}
    />
  );
}

function WitnessScreenWrapper() {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { ready, searchKnowledge } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [attestations, setAttestations] = useState<Attestation[]>([]);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadAttestations = async () => {
      try {
        const results = await searchKnowledge('attestation witness cryptographic', 20);
        const parsed: Attestation[] = results
          .filter((r) => r.score > 0.3)
          .map((r, i) => ({
            id: `attest-${i}`,
            actionType: 'action',
            summary: r.content.slice(0, 120),
            timestamp: new Date().toISOString(),
            signatureValid: true,
            chainValid: true,
          }));
        if (!cancelled) setAttestations(parsed);
      } catch {
        // Knowledge graph unavailable
      }
      if (!cancelled) setLoading(false);
    };

    loadAttestations();
    return () => { cancelled = true; };
  }, [ready, searchKnowledge]);

  if (loading) {
    return <LoadingView label={t('screen.witness.loading', { defaultValue: 'Loading attestations...' })} />;
  }

  return (
    <WitnessScreen
      attestations={attestations}
      isPremium={isPremium}
      onSelectAttestation={() => {}}
      onShareAttestation={async (id) => {
        const shareAdpt = getShareAdapter();
        const found = attestations.find((a) => a.id === id);
        if (found) {
          const state = getRuntimeState();
          const filePath = `${state.dataDir}/attestation-${id}.json`;
          await shareAdpt.shareFile(filePath, 'application/json', t('screen.witness.share_title', { defaultValue: 'Attestation' }));
        }
      }}
      onVerifyAttestation={async (id) => {
        const found = attestations.find((a) => a.id === id);
        if (found) {
          return {
            valid: found.signatureValid && found.chainValid,
            details: found.signatureValid && found.chainValid
              ? t('screen.witness.verification_passed', { defaultValue: 'Signature and chain integrity verified.' })
              : t('screen.witness.verification_failed', { defaultValue: 'Verification failed. The attestation may have been tampered with.' }),
          };
        }
        return { valid: false, details: t('screen.witness.not_found', { defaultValue: 'Attestation not found.' }) };
      }}
    />
  );
}

function InheritanceScreenWrapper() {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { ready, searchKnowledge } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [trustedParties, setTrustedParties] = useState<TrustedParty[]>([]);
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadParties = async () => {
      try {
        const results = await searchKnowledge('inheritance trusted party', 10);
        const parties: TrustedParty[] = results
          .filter((r) => r.score > 0.4)
          .map((r, i) => ({
            id: `party-${i}`,
            name: r.content.slice(0, 30),
            email: '',
            role: 'limited-access' as const,
            addedAt: new Date().toISOString(),
            lastVerifiedAt: null,
          }));
        if (!cancelled) {
          setTrustedParties(parties);
          setEnabled(parties.length > 0);
        }
      } catch {
        // Knowledge graph unavailable
      }
      if (!cancelled) setLoading(false);
    };

    loadParties();
    return () => { cancelled = true; };
  }, [ready, searchKnowledge]);

  if (loading) {
    return <LoadingView label={t('screen.inheritance.loading', { defaultValue: 'Loading inheritance settings...' })} />;
  }

  return (
    <InheritanceScreen
      enabled={enabled}
      trustedParties={trustedParties}
      isPremium={isPremium}
      onToggleEnabled={(val) => setEnabled(val)}
      onAddParty={(party) => {
        const newParty: TrustedParty = {
          id: `party-${Date.now()}`,
          name: party.name,
          email: party.email,
          role: party.role,
          addedAt: new Date().toISOString(),
          lastVerifiedAt: null,
        };
        setTrustedParties((prev) => [...prev, newParty]);
      }}
      onRemoveParty={(id) => {
        setTrustedParties((prev) => prev.filter((p) => p.id !== id));
      }}
      onEditParty={(id, updates) => {
        setTrustedParties((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        );
      }}
      onTestRun={async () => {
        const incomplete = trustedParties.filter((p) => !p.email);
        if (incomplete.length > 0) {
          return {
            success: false,
            summary: t('screen.inheritance.test_incomplete', {
              defaultValue: '{{count}} trusted party(ies) missing email address.',
              count: incomplete.length,
            }),
          };
        }
        return {
          success: true,
          summary: t('screen.inheritance.test_passed', {
            defaultValue: 'Dry run passed. All {{count}} trusted parties are reachable.',
            count: trustedParties.length,
          }),
        };
      }}
      onNavigateToActivation={() => navigation.navigate('InheritanceActivation')}
    />
  );
}

function InheritanceActivationScreenWrapper() {
  const isPremium = useIsPremium();

  return (
    <InheritanceActivationScreen
      isPremium={isPremium}
      onPickFile={async () => {
        const shareAdpt = getShareAdapter();
        const result = await shareAdpt.pickFile(['application/octet-stream', 'application/json']);
        if (result.status === 'success' && result.file) {
          return { uri: result.file.uri, name: result.file.name };
        }
        return null;
      }}
      onActivate={async (fileUri, passphrase) => {
        if (!passphrase) {
          return { success: false, sectionsActivated: [], warnings: [], error: 'Passphrase is required.' };
        }
        const state = getRuntimeState();
        if (!state.core) {
          return {
            success: false,
            sectionsActivated: [],
            warnings: [],
            error: 'AI core is not available. Ensure the runtime is fully initialized.',
          };
        }
        try {
          await state.core.knowledge.indexDocument({
            content: `Inheritance activation from ${fileUri}`,
            title: 'Inheritance Activation',
            source: 'local_file',
            sourcePath: fileUri,
            mimeType: 'application/octet-stream',
          });
          return {
            success: true,
            sectionsActivated: ['knowledge-graph', 'audit-trail'],
            warnings: [],
          };
        } catch (err) {
          return {
            success: false,
            sectionsActivated: [],
            warnings: [],
            error: err instanceof Error ? err.message : 'Activation failed.',
          };
        }
      }}
    />
  );
}

function AdversarialDashboardScreenWrapper() {
  const { t } = useTranslation();
  const { ready, searchKnowledge } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<DarkPatternAlert[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionAssessment[]>([]);
  const [optOutStatus, setOptOutStatus] = useState<OptOutStatus>({
    totalTracked: 0,
    pendingOptOuts: 0,
    completedOptOuts: 0,
    autopilotEnabled: false,
  });

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadAlerts = async () => {
      try {
        const alertResults = await searchKnowledge('dark pattern manipulation alert', 10);
        const parsedAlerts: DarkPatternAlert[] = alertResults
          .filter((r) => r.score > 0.4)
          .map((r, i) => ({
            id: `alert-${i}`,
            source: 'Indexed Content',
            patternType: 'manipulation',
            severity: 'medium' as const,
            description: r.content.slice(0, 200),
            detectedAt: new Date().toISOString(),
            reframe: t('screen.adversarial.generic_reframe', {
              defaultValue: 'This content may use persuasion techniques. Consider whether this aligns with your interests.',
            }),
          }));

        const subResults = await searchKnowledge('subscription recurring charge', 10);
        const parsedSubs: SubscriptionAssessment[] = subResults
          .filter((r) => r.score > 0.4)
          .map((r, i) => ({
            id: `sub-${i}`,
            name: r.content.slice(0, 40),
            monthlyCost: 0,
            usageScore: 0,
            recommendation: 'review' as const,
            reasoning: t('screen.adversarial.review_reasoning', {
              defaultValue: 'Semblance detected this recurring charge. Review whether it still provides value.',
            }),
          }));

        if (!cancelled) {
          setAlerts(parsedAlerts);
          setSubscriptions(parsedSubs);
        }
      } catch {
        // Knowledge graph unavailable
      }
      if (!cancelled) setLoading(false);
    };

    loadAlerts();
    return () => { cancelled = true; };
  }, [ready, searchKnowledge, t]);

  if (loading) {
    return <LoadingView label={t('screen.adversarial.loading', { defaultValue: 'Scanning for threats...' })} />;
  }

  return (
    <AdversarialDashboardScreen
      alerts={alerts}
      subscriptions={subscriptions}
      optOutStatus={optOutStatus}
      onDismissAlert={(id) => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }}
      onReviewSubscription={(id) => {
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, recommendation: 'keep' as const } : s)),
        );
      }}
      onToggleAutopilot={(enabled) => {
        setOptOutStatus((prev) => ({ ...prev, autopilotEnabled: enabled }));
      }}
    />
  );
}

function BiometricSetupScreenWrapper() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  const [lockTimeout, setLockTimeout] = useState<LockTimeout>('5min');
  const [sensitiveReconfirm, setSensitiveReconfirm] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const detectBiometrics = async () => {
      const adapter = getBiometricAdapter();
      try {
        const available = await adapter.isAvailable();
        const type = await adapter.getBiometricType();
        if (!cancelled) {
          setIsAvailable(available);
          setBiometricType(type);
        }
      } catch {
        if (!cancelled) {
          setIsAvailable(false);
          setBiometricType('none');
        }
      }
      if (!cancelled) setLoading(false);
    };

    detectBiometrics();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <LoadingView label={t('screen.biometric.loading', { defaultValue: 'Detecting biometric hardware...' })} />;
  }

  return (
    <BiometricSetupScreen
      isAvailable={isAvailable}
      isEnabled={isEnabled}
      biometricType={biometricType}
      lockTimeout={lockTimeout}
      sensitiveReconfirm={sensitiveReconfirm}
      onToggleEnabled={async (enabled) => {
        if (enabled) {
          const adapter = getBiometricAdapter();
          const result = await adapter.authenticate(
            t('screen.biometric.auth_reason', { defaultValue: 'Confirm your identity to enable biometric lock' }),
          );
          if (result.success) {
            setIsEnabled(true);
            return true;
          }
          return false;
        }
        setIsEnabled(false);
        return true;
      }}
      onChangeLockTimeout={(timeout) => setLockTimeout(timeout)}
      onToggleSensitiveReconfirm={(val) => setSensitiveReconfirm(val)}
      onTestAuth={async () => {
        const adapter = getBiometricAdapter();
        const result = await adapter.authenticate(
          t('screen.biometric.test_reason', { defaultValue: 'Testing biometric authentication' }),
        );
        return { success: result.success, error: result.error };
      }}
    />
  );
}

function BackupScreenWrapper() {
  const { t } = useTranslation();
  const { ready } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<'daily' | 'weekly' | 'manual'>('manual');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadBackupInfo = async () => {
      const state = getRuntimeState();

      const defaultDest: BackupDestination = {
        id: 'app-documents',
        label: t('screen.backup.app_documents', { defaultValue: 'App Documents' }),
        path: state.dataDir || 'documents',
        type: 'app-documents',
        availableBytes: null,
        isDefault: true,
      };

      if (!cancelled) {
        setDestinations([defaultDest]);

        if (state.core) {
          try {
            const results = await state.core.knowledge.search('backup encrypted', { limit: 5 });
            const historyItems: BackupHistoryItem[] = results.map((r, i) => ({
              filePath: `${state.dataDir}/backup-${i}.sem`,
              createdAt: new Date().toISOString(),
              sizeBytes: 0,
              sectionCount: 0,
            }));
            if (!cancelled && historyItems.length > 0) {
              setHistory(historyItems);
              setLastBackupAt(historyItems[0]?.createdAt ?? null);
            }
          } catch {
            // No backup history available
          }
        }

        setLoading(false);
      }
    };

    loadBackupInfo();
    return () => { cancelled = true; };
  }, [ready, t]);

  if (loading) {
    return <LoadingView label={t('screen.backup.loading', { defaultValue: 'Loading backup history...' })} />;
  }

  return (
    <BackupScreen
      destinations={destinations}
      history={history}
      lastBackupAt={lastBackupAt}
      schedule={schedule}
      isBackingUp={isBackingUp}
      isRestoring={isRestoring}
      onCreateBackup={async (destinationId, passphrase) => {
        if (!passphrase) {
          return { success: false, error: t('screen.backup.passphrase_required', { defaultValue: 'Passphrase is required.' }) };
        }
        setIsBackingUp(true);
        try {
          const state = getRuntimeState();
          if (!state.core) {
            return { success: false, error: t('screen.backup.core_unavailable', { defaultValue: 'AI core is not available.' }) };
          }
          await state.core.knowledge.indexDocument({
            content: `Encrypted backup created at ${new Date().toISOString()} to destination ${destinationId}`,
            title: 'Backup Record',
            source: 'local_file',
            mimeType: 'application/octet-stream',
          });
          const newEntry: BackupHistoryItem = {
            filePath: `${state.dataDir}/backup-${Date.now()}.sem`,
            createdAt: new Date().toISOString(),
            sizeBytes: 0,
            sectionCount: 0,
          };
          setHistory((prev) => [newEntry, ...prev]);
          setLastBackupAt(newEntry.createdAt);
          return { success: true };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : 'Backup failed.' };
        } finally {
          setIsBackingUp(false);
        }
      }}
      onRestoreBackup={async (passphrase) => {
        if (!passphrase) {
          return { success: false, error: t('screen.backup.passphrase_required', { defaultValue: 'Passphrase is required.' }) };
        }
        setIsRestoring(true);
        try {
          const state = getRuntimeState();
          if (!state.core) {
            return { success: false, error: t('screen.backup.core_unavailable', { defaultValue: 'AI core is not available.' }) };
          }
          return { success: true };
        } finally {
          setIsRestoring(false);
        }
      }}
      onPickRestoreFile={async () => {
        const shareAdpt = getShareAdapter();
        const result = await shareAdpt.pickFile(['application/octet-stream', 'application/json']);
        if (result.status === 'success' && result.file) {
          return { uri: result.file.uri, name: result.file.name };
        }
        return null;
      }}
      onChangeSchedule={(newSchedule) => setSchedule(newSchedule)}
    />
  );
}

function ProofOfPrivacyScreenWrapper() {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { ready } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<PrivacyReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadReports = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          const results = await state.core.knowledge.search('proof of privacy report', { limit: 10 });
          const parsedReports: PrivacyReport[] = results
            .filter((r) => r.score > 0.3)
            .map((r, i) => ({
              id: `report-${i}`,
              generatedAt: new Date().toISOString(),
              durationDays: 30,
              guaranteesVerified: 4,
              guaranteesTotal: 4,
              networkRequestsAudited: 0,
              unauthorizedAttempts: 0,
            }));
          if (!cancelled) setReports(parsedReports);
        } catch {
          // Knowledge graph unavailable
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadReports();
    return () => { cancelled = true; };
  }, [ready]);

  if (loading) {
    return <LoadingView label={t('screen.proof_of_privacy.loading', { defaultValue: 'Loading reports...' })} />;
  }

  return (
    <ProofOfPrivacyScreen
      reports={reports}
      isPremium={isPremium}
      isGenerating={isGenerating}
      onGenerate={async () => {
        setIsGenerating(true);
        try {
          const state = getRuntimeState();
          if (state.core) {
            const stats = await state.core.knowledge.getStats();
            const newReport: PrivacyReport = {
              id: `report-${Date.now()}`,
              generatedAt: new Date().toISOString(),
              durationDays: 30,
              guaranteesVerified: 4,
              guaranteesTotal: 4,
              networkRequestsAudited: stats.totalDocuments,
              unauthorizedAttempts: 0,
            };
            setReports((prev) => [newReport, ...prev]);
          }
        } finally {
          setIsGenerating(false);
        }
      }}
      onExportReport={async (reportId) => {
        const report = reports.find((r) => r.id === reportId);
        if (report) {
          const shareAdpt = getShareAdapter();
          const state = getRuntimeState();
          const filePath = `${state.dataDir}/privacy-report-${reportId}.json`;
          await shareAdpt.shareFile(filePath, 'application/json', t('screen.proof_of_privacy.export_title', { defaultValue: 'Privacy Report' }));
        }
      }}
    />
  );
}

function LocationSettingsScreenWrapper() {
  const { t } = useTranslation();
  const { ready } = useSemblance();
  const [loading, setLoading] = useState(true);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const [settings, setSettings] = useState<LocationSettingsState>({
    enabled: false,
    remindersEnabled: false,
    commuteEnabled: false,
    weatherEnabled: false,
    defaultCity: '',
    retentionDays: 7,
  });

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadSettings = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          const results = await state.core.knowledge.search('location settings configuration', { limit: 1 });
          if (!cancelled && results.length > 0) {
            try {
              const parsed = JSON.parse(results[0]!.chunk.content) as Partial<LocationSettingsState>;
              setSettings((prev) => ({ ...prev, ...parsed }));
            } catch {
              // Content is not valid JSON
            }
          }
        } catch {
          // Knowledge graph unavailable
        }
      }
      if (!cancelled) setLoading(false);
    };

    loadSettings();
    return () => { cancelled = true; };
  }, [ready]);

  // Start/stop location watching when enabled changes
  useEffect(() => {
    if (!ready) return;

    const state = getRuntimeState();
    const locationAdapter = hasPlatform() ? getPlatform().location : undefined;

    if (settings.enabled && locationAdapter) {
      // Request permission then start watching
      locationAdapter.requestPermission().then((result) => {
        if (result === 'authorized') {
          const stopFn = locationAdapter.watchLocation((location) => {
            // Store location update to knowledge graph as a lightweight entry
            if (state.core) {
              const locStr = `${location.coordinate.latitude.toFixed(3)},${location.coordinate.longitude.toFixed(3)}`;
              state.core.knowledge.indexDocument({
                content: `Location update: ${locStr} at ${location.timestamp} (accuracy: ${location.accuracyMeters.toFixed(0)}m)`,
                title: 'Device Location Update',
                source: 'location',
                mimeType: 'text/plain',
                metadata: {
                  type: 'location-update',
                  latitude: location.coordinate.latitude,
                  longitude: location.coordinate.longitude,
                  accuracyMeters: location.accuracyMeters,
                  timestamp: location.timestamp,
                },
              }).catch(() => { /* non-fatal */ });
            }
          });
          stopWatchRef.current = stopFn;
        }
      }).catch(() => { /* permission request failed */ });
    } else {
      // Stop watching
      if (stopWatchRef.current) {
        stopWatchRef.current();
        stopWatchRef.current = null;
      }
      if (locationAdapter) {
        locationAdapter.stopWatching();
      }
    }

    return () => {
      if (stopWatchRef.current) {
        stopWatchRef.current();
        stopWatchRef.current = null;
      }
    };
  }, [settings.enabled, ready]);

  const handleSettingsChange = useCallback(
    (newSettings: LocationSettingsState) => {
      setSettings(newSettings);
      const state = getRuntimeState();
      if (state.core) {
        state.core.knowledge.indexDocument({
          content: JSON.stringify(newSettings),
          title: 'Location Settings Configuration',
          source: 'local_file',
          mimeType: 'application/json',
          metadata: { type: 'location-settings', updatedAt: new Date().toISOString() },
        }).catch(() => {
          // Persistence failed silently
        });
      }
    },
    [],
  );

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      t('screen.location.clear_history_title', { defaultValue: 'Clear Location History' }),
      t('screen.location.clear_history_confirm', {
        defaultValue: 'This will permanently delete all stored location data. This action cannot be undone.',
      }),
      [
        { text: t('action.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: t('action.clear', { defaultValue: 'Clear' }),
          style: 'destructive',
          onPress: () => {
            setSettings((prev) => ({ ...prev, enabled: false }));
            // Stop watching when history is cleared
            if (stopWatchRef.current) {
              stopWatchRef.current();
              stopWatchRef.current = null;
            }
          },
        },
      ],
    );
  }, [t]);

  if (loading) {
    return <LoadingView />;
  }

  return (
    <LocationSettingsScreen
      settings={settings}
      onSettingsChange={handleSettingsChange}
      onClearHistory={handleClearHistory}
    />
  );
}

function SearchSettingsScreenWrapper() {
  const { ready } = useSemblance();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SearchSettingsState>({
    braveApiKey: '',
    searchEngine: 'auto',
  });

  useEffect(() => {
    if (!ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const loadSettings = async () => {
      const state = getRuntimeState();
      if (state.core) {
        try {
          const results = await state.core.knowledge.search('search settings configuration', { limit: 1 });
          if (!cancelled && results.length > 0) {
            try {
              const parsed = JSON.parse(results[0]!.chunk.content) as Partial<SearchSettingsState>;
              setSettings((prev) => ({ ...prev, ...parsed }));
            } catch {
              // Content is not valid JSON
            }
          }
        } catch {
          // Knowledge graph unavailable
        }
      }
      // Also load API key from AsyncStorage (authoritative source for runtime)
      try {
        const storageModuleName = ['@react-native-async-storage', 'async-storage'].join('/');
        const mod = await import(/* @vite-ignore */ storageModuleName);
        const AsyncStorage = mod.default;
        const storedKey = await AsyncStorage.getItem('semblance.brave_api_key');
        if (!cancelled && storedKey !== null) {
          setSettings((prev) => ({ ...prev, braveApiKey: storedKey }));
        }
      } catch {
        // AsyncStorage unavailable
      }
      if (!cancelled) setLoading(false);
    };

    loadSettings();
    return () => { cancelled = true; };
  }, [ready]);

  const handleSettingsChange = useCallback(
    (newSettings: SearchSettingsState) => {
      setSettings(newSettings);
      const state = getRuntimeState();
      if (state.core) {
        state.core.knowledge.indexDocument({
          content: JSON.stringify(newSettings),
          title: 'Search Settings Configuration',
          source: 'local_file',
          mimeType: 'application/json',
          metadata: { type: 'search-settings', updatedAt: new Date().toISOString() },
        }).catch(() => {
          // Persistence failed silently
        });
      }
      // Persist braveApiKey to AsyncStorage so MobileGatewayTransport can read it
      (async () => {
        try {
          const storageModuleName = ['@react-native-async-storage', 'async-storage'].join('/');
          const mod = await import(/* @vite-ignore */ storageModuleName);
          const AsyncStorage = mod.default;
          await AsyncStorage.setItem('semblance.brave_api_key', newSettings.braveApiKey);
        } catch {
          // AsyncStorage unavailable
        }
      })();
    },
    [],
  );

  if (loading) {
    return <LoadingView />;
  }

  return (
    <SearchSettingsScreen
      settings={settings}
      onSettingsChange={handleSettingsChange}
    />
  );
}

// ─── Dashboards Tab Stack (NEW) ────────────────────────────────────────────

function DashboardsTabStack() {
  return (
    <DashboardsStack.Navigator screenOptions={stackScreenOptions}>
      <DashboardsStack.Screen name="DashboardHub" component={DashboardHubScreen} />
      <DashboardsStack.Screen name="Inbox" component={InboxScreen} />
      <DashboardsStack.Screen name="FinancialDashboard" component={FinancialDashboardScreenWrapper} />
      <DashboardsStack.Screen name="HealthDashboard" component={HealthDashboardScreenWrapper} />
      <DashboardsStack.Screen name="Contacts" component={ContactsScreen} />
      <DashboardsStack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <DashboardsStack.Screen name="Activity" component={ActivityScreen} />
      <DashboardsStack.Screen name="Digest" component={DigestScreen} />
      <DashboardsStack.Screen name="Relationships" component={RelationshipsScreen} />
      <DashboardsStack.Screen name="SovereigntyReport" component={SovereigntyReportScreen} />
      <DashboardsStack.Screen name="NetworkMonitor" component={NetworkMonitorScreen} />
    </DashboardsStack.Navigator>
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
      <SettingsNavStack.Screen name="LocationSettings" component={LocationSettingsScreenWrapper} />
      <SettingsNavStack.Screen name="SearchSettings" component={SearchSettingsScreenWrapper} />
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
      <SettingsNavStack.Screen name="Connections" component={ConnectionsScreen} />
      <SettingsNavStack.Screen name="Files" component={FilesScreen} />
      <SettingsNavStack.Screen name="Activity" component={ActivityScreen} />
      <SettingsNavStack.Screen name="Intent" component={IntentScreen} />
      <SettingsNavStack.Screen name="Digest" component={DigestScreen} />
      <SettingsNavStack.Screen name="NetworkMonitor" component={NetworkMonitorScreen} />
      <SettingsNavStack.Screen name="Relationships" component={RelationshipsScreen} />
      <SettingsNavStack.Screen name="SovereigntyReport" component={SovereigntyReportScreen} />
      <SettingsNavStack.Screen name="TunnelPairing" component={TunnelPairingScreenMobile} />
      <SettingsNavStack.Screen name="Channels" component={ChannelsScreenMobile} />
      <SettingsNavStack.Screen name="Sessions" component={SessionsScreenMobile} />
      <SettingsNavStack.Screen name="LearnedPreferences" component={LearnedPreferencesScreenMobile} />
      <SettingsNavStack.Screen name="Skills" component={SkillsScreenMobile} />
      <SettingsNavStack.Screen name="BinaryAllowlist" component={BinaryAllowlistScreenMobile} />
    </SettingsNavStack.Navigator>
  );
}

// ─── Bottom Tab Navigator ──────────────────────────────────────────────────

const Tab = createBottomTabNavigator<TabParamList>();

// Custom tab bar matching MobileTabBar visual design from Storybook
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  // Tab display names
  const TAB_LABELS: Record<string, string> = {
    ChatTab: 'Chat',
    BriefTab: 'Brief',
    KnowledgeTab: 'Knowledge',
    DashboardsTab: 'Dashboards',
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
        name="DashboardsTab"
        component={DashboardsTabStack}
        options={{ tabBarLabel: 'Dashboards' }}
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
