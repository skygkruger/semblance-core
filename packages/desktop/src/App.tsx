import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { DesktopSidebar, PrivacyBadge, ThemeToggle } from '@semblance/ui';
import type { NavItem, ThemeMode } from '@semblance/ui';
import { AppStateProvider, useAppState, useAppDispatch } from './state/AppState';
import { LicenseProvider, useLicense } from './contexts/LicenseContext';
import { useTheme } from './hooks/useTheme';
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
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';
import { UpdateChecker } from './components/UpdateChecker';
import { UpgradeScreen as UpgradeScreenComponent } from '@semblance/ui';

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

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
  { id: 'morning-brief', label: 'Brief', icon: <SunriseIcon /> },
  { id: 'knowledge', label: 'Knowledge', icon: <BrainIcon /> },
  { id: 'files', label: 'Files', icon: <FolderIcon /> },
  { id: 'connections', label: 'Connections', icon: <PlugIcon /> },
  { id: 'activity', label: 'Activity', icon: <ClockIcon /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldIcon /> },
  { id: 'relationships', label: 'Contacts', icon: <ContactsIcon /> },
  { id: 'digest', label: 'Digest', icon: <DigestIcon /> },
  { id: 'network', label: 'Network', icon: <NetworkIcon /> },
];

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const license = useLicense();

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
    <div className="flex h-screen bg-semblance-bg-light dark:bg-semblance-bg-dark">
      <UpdateChecker />
      <DesktopSidebar
        items={navItems}
        activeId={activeId}
        onNavigate={(id) => navigate('/' + id)}
        footer={
          <div className="space-y-3">
            <NetworkStatusIndicator onClick={() => navigate('/network')} />
            <PrivacyBadge />
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
                transition-colors duration-fast
                focus-visible:outline-none focus-visible:shadow-focus
                ${activeId === 'settings'
                  ? 'bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark text-semblance-primary'
                  : 'text-semblance-text-secondary dark:text-semblance-text-secondary-dark hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark'
                }
              `.trim()}
            >
              <GearIcon />
              <span>Settings</span>
            </button>
            <ThemeToggle
              value={theme}
              onChange={(mode) => {
                setTheme(mode);
                dispatch({ type: 'SET_THEME', theme: mode as ThemeMode });
              }}
              className="w-full"
            />
          </div>
        }
      />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/chat" element={<ChatScreen />} />
          <Route path="/inbox" element={<InboxScreen />} />
          <Route path="/morning-brief" element={<MorningBriefScreen />} />
          <Route path="/knowledge" element={<KnowledgeGraphScreen />} />
          <Route path="/files" element={<FilesScreen />} />
          <Route path="/connections" element={<ConnectionsScreen />} />
          <Route path="/activity" element={<ActivityScreen />} />
          <Route path="/privacy" element={<PrivacyScreen />} />
          <Route path="/relationships" element={<RelationshipsScreen />} />
          <Route path="/digest" element={<DigestScreen />} />
          <Route path="/network" element={<NetworkMonitorScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route
            path="/upgrade"
            element={
              <UpgradeScreenComponent
                currentTier={license.tier}
                isFoundingMember={license.isFoundingMember}
                foundingSeat={license.foundingSeat}
                onCheckout={license.openCheckout}
                onActivateKey={license.activateKey}
                onManageSubscription={license.manageSubscription}
                onBack={() => navigate('/settings')}
              />
            }
          />
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <LicenseProvider>
        <AppContent />
      </LicenseProvider>
    </AppStateProvider>
  );
}
