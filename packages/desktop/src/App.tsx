import { useEffect, useCallback, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { DesktopSidebar, PrivacyBadge, DotMatrix, ToastContainer } from '@semblance/ui';
import type { NavItem, ToastItem } from '@semblance/ui';
import { AppStateProvider, useAppState, useAppDispatch } from './state/AppState';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';
import { SoundEngineProvider, useSound } from './sound/SoundEngineContext';
import { useTauriEvent } from './hooks/useTauriEvent';
import { BiometricGate } from './auth/BiometricGate';

import { OnboardingFlow } from './screens/OnboardingFlow';
import { ChatScreen } from './screens/ChatScreen';
import { FilesScreen } from './screens/FilesScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InboxScreen } from './screens/InboxScreen';
import { DigestScreen } from './screens/DigestScreen';
import { NetworkMonitorScreen } from './screens/NetworkMonitorScreen';
import { RelationshipsScreen } from './screens/RelationshipsScreen';
import { ConnectionsScreen } from './screens/ConnectionsScreen';
import { MorningBriefScreen } from './screens/MorningBriefScreen';
import { KnowledgeGraphScreen } from './screens/KnowledgeGraphScreen';
import { IntentScreen } from './screens/IntentScreen';
import { FinancialDashboardScreen } from './screens/FinancialDashboardScreen';
import { HealthDashboardScreen } from './screens/HealthDashboardScreen';
import { SovereigntyReportScreen } from './screens/SovereigntyReportScreen';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';
import { UpdateChecker } from './components/UpdateChecker';
import { UpgradeScreen as UpgradeScreenComponent, UpgradeEmailCapture } from '@semblance/ui';
import { submitUpgradeEmail } from './ipc/commands';

// Lucide-style inline SVG icons (20x20, stroke-based)
function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function ScrollIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 13H8" /><path d="M16 17H8" /><path d="M16 13h-2" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
  );
}
function ContactsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function DigestIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
}
function NetworkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v6" /><path d="M15 2v6" /><path d="M12 18v4" /><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M9 8a6 6 0 0 0-6 6" /><path d="M15 8a6 6 0 0 1 6 6" />
    </svg>
  );
}
function PlugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6V8Z" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function SunriseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" /><path d="m4.93 10.93 2.83 2.83" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-2.83 2.83" />
      <path d="M22 22H2" /><path d="M16 6l-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
    </svg>
  );
}
function BrainIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M12 18v4" />
    </svg>
  );
}
function CompassIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}
function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
  { id: 'morning-brief', label: 'Brief', icon: <SunriseIcon /> },
  { id: 'knowledge', label: 'Knowledge', icon: <BrainIcon /> },
  { id: 'intent', label: 'Intent', icon: <CompassIcon /> },
  { id: 'files', label: 'Files', icon: <FolderIcon /> },
  { id: 'connections', label: 'Connections', icon: <PlugIcon /> },
  { id: 'activity', label: 'Activity', icon: <ClockIcon /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldIcon /> },
  { id: 'sovereignty-report', label: 'Sovereignty', icon: <ScrollIcon /> },
  { id: 'finance', label: 'Finance', icon: <DollarIcon /> },
  { id: 'health', label: 'Health', icon: <HeartIcon /> },
  { id: 'digest', label: 'Digest', icon: <DigestIcon /> },
  { id: 'network', label: 'Network', icon: <NetworkIcon /> },
  { id: 'settings', label: 'Settings', icon: <GearIcon /> },
];

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const license = useLicense();
  const { play } = useSound();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Hydrate inference status from sidecar init
  useTauriEvent<{ ollamaStatus?: string; inferenceEngine?: string; activeModel?: string; availableModels?: string[] }>(
    'semblance://status-update',
    useCallback((payload) => {
      if (payload.ollamaStatus) {
        dispatch({ type: 'SET_OLLAMA_STATUS', status: payload.ollamaStatus as 'connected' | 'disconnected' | 'checking' });
      }
      if (payload.inferenceEngine) {
        dispatch({ type: 'SET_INFERENCE_ENGINE', engine: payload.inferenceEngine as 'native' | 'ollama' | 'none' });
      }
      if (payload.activeModel) {
        dispatch({ type: 'SET_ACTIVE_MODEL', model: payload.activeModel });
      }
      if (payload.availableModels) {
        dispatch({ type: 'SET_AVAILABLE_MODELS', models: payload.availableModels });
      }
    }, [dispatch]),
  );

  // Sound: Morning brief ready
  useTauriEvent('semblance://morning-brief-ready', useCallback(() => {
    play('morning_brief_ready');
  }, [play]));

  // Proactive notification event (sound removed per user request)
  useTauriEvent('semblance://proactive-notification', useCallback(() => {
    // notification sound removed
  }, []));

  // Toast notifications from sidecar
  useTauriEvent<{ id: string; message: string; variant: 'info' | 'success' | 'attention' | 'action' }>(
    'semblance://toast',
    useCallback((payload) => {
      setToasts(prev => [...prev, { id: payload.id, message: payload.message, variant: payload.variant }]);
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== payload.id));
      }, 5000);
    }, []),
  );

  // OS Notifications: Forward sidecar notification events to Tauri notification plugin
  useTauriEvent<{ id: string; title: string; body: string }>('semblance://schedule-notification', useCallback((payload) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('@tauri-apps/plugin-notification' as string).then((mod: any) => {
      mod.sendNotification({ title: payload.title, body: payload.body });
    }).catch(() => {
      // Notification plugin not available — graceful degradation
    });
  }, []));

  // Derive active screen from URL path
  const activeId = location.pathname.slice(1) || 'chat';

  // Hydrate license status on startup + listen for deep link activations
  useEffect(() => {
    license.refresh().catch(() => {
      // Not yet initialized — will be free tier by default
    });

    const unlistenFoundingPromise = listen<{ token: string }>('founding-activate', async (event) => {
      try {
        const result = await license.activateFoundingToken(event.payload.token);
        if (result.success) {
          if (!state.onboardingComplete) {
            dispatch({ type: 'SET_ONBOARDING_STEP', step: 9 });
          }
        }
      } catch {
        // Activation failed — user can try manual code entry
      }
    });

    const unlistenLicensePromise = listen<{ key: string }>('license-activate', async (event) => {
      try {
        await license.activateKey(event.payload.key);
      } catch {
        // Activation failed — user can try manual code entry
      }
    });

    const unlistenAutoDetectPromise = listen<{ tier: string; expiresAt?: string }>('semblance://license-auto-activated', async () => {
      await license.refresh();
    });

    return () => {
      unlistenFoundingPromise.then((fn) => fn());
      unlistenLicensePromise.then((fn) => fn());
      unlistenAutoDetectPromise.then((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show onboarding if not complete
  if (!state.onboardingComplete) {
    return <OnboardingFlow />;
  }

  return (
    <div className="flex h-screen">
      <DotMatrix />
      <UpdateChecker />
      <DesktopSidebar
        items={navItems}
        activeId={activeId}
        onNavigate={(id) => navigate('/' + id)}
        footer={
          <div className="space-y-3">
            <NetworkStatusIndicator onClick={() => navigate('/network')} />
            <PrivacyBadge />
          </div>
        }
      />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/chat" element={<ChatScreen />} />
          <Route path="/inbox" element={<InboxScreen />} />
          <Route path="/morning-brief" element={<MorningBriefScreen />} />
          <Route path="/knowledge" element={<KnowledgeGraphScreen />} />
          <Route path="/intent" element={<IntentScreen />} />
          <Route path="/files" element={<FilesScreen />} />
          <Route path="/connections" element={<ConnectionsScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/privacy" element={<PrivacyScreen />} />
          <Route path="/sovereignty-report" element={<SovereigntyReportScreen />} />
          <Route path="/relationships" element={<RelationshipsScreen />} />
          <Route path="/digest" element={<DigestScreen />} />
          <Route path="/finance" element={<FinancialDashboardScreen />} />
          <Route path="/health" element={<HealthDashboardScreen />} />
          <Route path="/network" element={<NetworkMonitorScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route
            path="/upgrade"
            element={
              <div>
                <UpgradeScreenComponent
                  currentTier={license.tier}
                  isFoundingMember={license.isFoundingMember}
                  foundingSeat={license.foundingSeat}
                  onCheckout={license.openCheckout}
                  onActivateKey={license.activateKey}
                  onManageSubscription={license.manageSubscription}
                  onBack={() => navigate('/settings')}
                />
                {!license.isPremium && (
                  <div style={{ maxWidth: 480, margin: '24px auto', padding: '0 24px' }}>
                    <UpgradeEmailCapture
                      onSubmit={async (email) => {
                        await submitUpgradeEmail(email).catch(() => {});
                      }}
                    />
                  </div>
                )}
              </div>
            }
          />
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <LicenseProvider>
        <SoundEngineProvider>
          <BiometricGate>
            <AppContent />
          </BiometricGate>
        </SoundEngineProvider>
      </LicenseProvider>
    </AppStateProvider>
  );
}
