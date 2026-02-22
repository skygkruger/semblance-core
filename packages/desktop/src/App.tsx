import { Navigation, PrivacyBadge, ThemeToggle } from '@semblance/ui';
import type { NavItem } from '@semblance/ui';
import { AppStateProvider, useAppState, useAppDispatch } from './state/AppState';
import { useTheme } from './hooks/useTheme';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ChatScreen } from './screens/ChatScreen';
import { FilesScreen } from './screens/FilesScreen';
import { ActivityScreen } from './screens/ActivityScreen';
import { PrivacyScreen } from './screens/PrivacyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InboxScreen } from './screens/InboxScreen';
import { DigestScreen } from './screens/DigestScreen';
import { NetworkMonitorScreen } from './screens/NetworkMonitorScreen';
import { RelationshipsScreen } from './screens/RelationshipsScreen';
import { NetworkStatusIndicator } from './components/NetworkStatusIndicator';
import type { ThemeMode } from '@semblance/ui';

// Lucide-style inline SVG icons (16×16, stroke-based)
// Using inline SVGs to avoid needing lucide-react to be installed for build
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
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'inbox', label: 'Inbox', icon: <InboxIcon /> },
  { id: 'files', label: 'Files', icon: <FolderIcon /> },
  { id: 'activity', label: 'Activity', icon: <ClockIcon /> },
  { id: 'privacy', label: 'Privacy', icon: <ShieldIcon /> },
  { id: 'relationships', label: 'Contacts', icon: <ContactsIcon /> },
  { id: 'digest', label: 'Digest', icon: <DigestIcon /> },
  { id: 'network', label: 'Network', icon: <NetworkIcon /> },
];

function AppContent() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { theme, setTheme } = useTheme();

  // Show onboarding if not complete
  if (!state.onboardingComplete) {
    return <OnboardingScreen />;
  }

  const renderScreen = () => {
    switch (state.activeScreen) {
      case 'chat': return <ChatScreen />;
      case 'inbox': return <InboxScreen />;
      case 'files': return <FilesScreen />;
      case 'activity': return <ActivityScreen />;
      case 'privacy': return <PrivacyScreen />;
      case 'relationships': return <RelationshipsScreen />;
      case 'digest': return <DigestScreen />;
      case 'network': return <NetworkMonitorScreen />;
      case 'settings': return <SettingsScreen />;
      default: return <ChatScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-semblance-bg-light dark:bg-semblance-bg-dark">
      <Navigation
        items={navItems}
        activeId={state.activeScreen}
        onNavigate={(id) => dispatch({ type: 'SET_ACTIVE_SCREEN', screen: id })}
        footer={
          <div className="space-y-3">
            <NetworkStatusIndicator onClick={() => dispatch({ type: 'SET_ACTIVE_SCREEN', screen: 'network' })} />
            <PrivacyBadge />
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_ACTIVE_SCREEN', screen: 'settings' })}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium
                transition-colors duration-fast
                focus-visible:outline-none focus-visible:shadow-focus
                ${state.activeScreen === 'settings'
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
        {renderScreen()}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}
