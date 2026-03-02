/**
 * Desktop Integration Tests
 *
 * These tests verify the integration layer between the React frontend
 * and the Tauri Rust backend. Since we can't spin up Tauri in a unit test
 * environment, these tests verify:
 * - State management correctness (AppState reducer)
 * - Event handling patterns
 * - Data flow contracts
 * - Onboarding state persistence logic
 * - User name persistence and display
 * - Autonomy config persistence
 *
 * Full end-to-end Tauri tests require `tauri dev` and are run separately.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const STATE_FILE = join(ROOT, 'packages', 'desktop', 'src', 'state', 'AppState.tsx');
const CHAT_SCREEN = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'ChatScreen.tsx');
const ONBOARDING_SCREEN = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingFlow.tsx');
const SETTINGS_SCREEN = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'SettingsScreen.tsx');
const APP_FILE = join(ROOT, 'packages', 'desktop', 'src', 'App.tsx');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');

describe('AppState: State Shape', () => {
  const stateContent = readFileSync(STATE_FILE, 'utf-8');

  it('defines AppState interface with required fields', () => {
    expect(stateContent).toContain('userName:');
    expect(stateContent).toContain('onboardingComplete:');
    expect(stateContent).toContain('ollamaStatus:');
    expect(stateContent).toContain('activeModel:');
    expect(stateContent).toContain('availableModels:');
    expect(stateContent).toContain('indexingStatus:');
    expect(stateContent).toContain('knowledgeStats:');
    expect(stateContent).toContain('autonomyConfig:');
    expect(stateContent).toContain('theme:');
    expect(stateContent).toContain('privacyStatus:');
  });

  it('defines chat message state', () => {
    expect(stateContent).toContain('chatMessages:');
    expect(stateContent).toContain('isResponding:');
  });

  it('defines indexing sub-state fields', () => {
    expect(stateContent).toContain('filesScanned:');
    expect(stateContent).toContain('filesTotal:');
    expect(stateContent).toContain('chunksCreated:');
    expect(stateContent).toContain('currentFile:');
  });

  it('defines knowledge stats sub-state fields', () => {
    expect(stateContent).toContain('documentCount:');
    expect(stateContent).toContain('chunkCount:');
    expect(stateContent).toContain('indexSizeBytes:');
    expect(stateContent).toContain('lastIndexedAt:');
  });

  it('defines privacy status sub-state fields', () => {
    expect(stateContent).toContain('allLocal:');
    expect(stateContent).toContain('connectionCount:');
    expect(stateContent).toContain('anomalyDetected:');
  });
});

describe('AppState: Reducer Actions', () => {
  const stateContent = readFileSync(STATE_FILE, 'utf-8');

  it('handles SET_USER_NAME action', () => {
    expect(stateContent).toContain("'SET_USER_NAME'");
  });

  it('handles SET_ONBOARDING_COMPLETE action', () => {
    expect(stateContent).toContain("'SET_ONBOARDING_COMPLETE'");
  });

  it('handles SET_ACTIVE_MODEL action', () => {
    expect(stateContent).toContain("'SET_ACTIVE_MODEL'");
  });

  it('handles SET_AUTONOMY_TIER action', () => {
    expect(stateContent).toContain("'SET_AUTONOMY_TIER'");
  });

  it('handles SET_THEME action', () => {
    expect(stateContent).toContain("'SET_THEME'");
  });

  it('handles ADD_CHAT_MESSAGE action', () => {
    expect(stateContent).toContain("'ADD_CHAT_MESSAGE'");
  });

  it('handles APPEND_TO_LAST_MESSAGE action for streaming', () => {
    expect(stateContent).toContain("'APPEND_TO_LAST_MESSAGE'");
  });

  it('handles SET_IS_RESPONDING action', () => {
    expect(stateContent).toContain("'SET_IS_RESPONDING'");
  });

  it('handles SET_OLLAMA_STATUS action', () => {
    expect(stateContent).toContain("'SET_OLLAMA_STATUS'");
  });

  it('handles ADD_DIRECTORY action', () => {
    expect(stateContent).toContain("'ADD_DIRECTORY'");
  });

  it('handles REMOVE_DIRECTORY action', () => {
    expect(stateContent).toContain("'REMOVE_DIRECTORY'");
  });

  it('handles SET_ACTIVE_SCREEN action', () => {
    expect(stateContent).toContain("'SET_ACTIVE_SCREEN'");
  });
});

describe('Chat Interface: Streaming Pattern', () => {
  const chatContent = readFileSync(CHAT_SCREEN, 'utf-8');

  it('subscribes to semblance://chat-token events', () => {
    expect(chatContent).toContain('semblance://chat-token');
  });

  it('subscribes to semblance://chat-complete events', () => {
    expect(chatContent).toContain('semblance://chat-complete');
  });

  it('invokes sendMessage typed IPC command', () => {
    // Phase 5 migrated raw invoke() to typed IPC wrappers
    expect(chatContent).toContain('sendMessage');
  });

  it('appends streaming tokens to last message', () => {
    expect(chatContent).toContain('APPEND_TO_LAST_MESSAGE');
  });

  it('sets responding state during AI response', () => {
    expect(chatContent).toContain('SET_IS_RESPONDING');
  });

  it('has empty state with suggested questions', () => {
    expect(chatContent).toContain('chatMessages.length === 0');
    // Phase 7 i18n: suggestions use translation keys
    expect(chatContent).toContain('screen.chat.suggestion_topics');
  });
});

describe('Onboarding Flow', () => {
  const onboardingContent = readFileSync(ONBOARDING_SCREEN, 'utf-8');

  it('has 7-step STEP_ORDER sequence', () => {
    expect(onboardingContent).toContain('STEP_ORDER');
    expect(onboardingContent).toContain("'splash'");
    expect(onboardingContent).toContain("'hardware'");
    expect(onboardingContent).toContain("'data-sources'");
    expect(onboardingContent).toContain("'autonomy'");
    expect(onboardingContent).toContain("'naming-moment'");
    expect(onboardingContent).toContain("'naming-ai'");
    expect(onboardingContent).toContain("'initialize'");
  });

  it('has SplashScreen step', () => {
    expect(onboardingContent).toContain('SplashScreen');
    expect(onboardingContent).toContain("step === 'splash'");
  });

  it('has HardwareDetection step', () => {
    expect(onboardingContent).toContain('HardwareDetection');
    expect(onboardingContent).toContain("step === 'hardware'");
  });

  it('has DataSourcesStep (connectors)', () => {
    expect(onboardingContent).toContain('DataSourcesStep');
    expect(onboardingContent).toContain("step === 'data-sources'");
  });

  it('has AutonomyTierStep', () => {
    expect(onboardingContent).toContain('AutonomyTierStep');
    expect(onboardingContent).toContain("step === 'autonomy'");
  });

  it('has NamingMoment step (user name)', () => {
    expect(onboardingContent).toContain('NamingMoment');
    expect(onboardingContent).toContain("step === 'naming-moment'");
  });

  it('has NamingYourAI step (AI name)', () => {
    expect(onboardingContent).toContain('NamingYourAI');
    expect(onboardingContent).toContain("step === 'naming-ai'");
  });

  it('has InitializeStep (model download + knowledge moment)', () => {
    expect(onboardingContent).toContain('InitializeStep');
    expect(onboardingContent).toContain("step === 'initialize'");
  });

  it('persists user name via IPC command', () => {
    expect(onboardingContent).toContain('setUserName');
  });

  it('persists onboarding completion via IPC command', () => {
    expect(onboardingContent).toContain('setOnboardingComplete');
  });

  it('persists autonomy config via IPC command', () => {
    expect(onboardingContent).toContain('setAutonomyTier');
  });

  it('imports semblance-ui components', () => {
    expect(onboardingContent).toContain("from '@semblance/ui'");
  });

  it('uses useState<OnboardingStep> for step management', () => {
    expect(onboardingContent).toContain("useState<OnboardingStep>('splash')");
  });
});

describe('Onboarding: Gating', () => {
  const appContent = readFileSync(APP_FILE, 'utf-8');

  it('shows onboarding when not complete', () => {
    expect(appContent).toContain('onboardingComplete');
    expect(appContent).toContain('OnboardingFlow');
  });

  it('shows main app layout when onboarding is complete', () => {
    // Phase 5 migrated to React Router + DesktopSidebar
    expect(appContent).toContain('DesktopSidebar');
    expect(appContent).toContain('Routes');
  });
});

describe('Settings Screen', () => {
  const settingsContent = readFileSync(SETTINGS_SCREEN, 'utf-8');

  it('allows editing the Semblance name', () => {
    // Phase 5 migrated raw invoke() to typed IPC wrappers
    expect(settingsContent).toContain('setUserName');
    expect(settingsContent).toContain('editingName');
  });

  it('shows Ollama connection status', () => {
    expect(settingsContent).toContain('ollamaStatus');
  });

  it('provides model selection', () => {
    expect(settingsContent).toContain('availableModels');
    // Phase 5 migrated raw invoke() to typed IPC wrappers
    expect(settingsContent).toContain('selectModel');
  });

  it('includes autonomy configuration', () => {
    expect(settingsContent).toContain('AutonomySelector');
    // Phase 5 migrated raw invoke() to typed IPC wrappers
    expect(settingsContent).toContain('setAutonomyTier');
  });

  it('includes theme toggle', () => {
    expect(settingsContent).toContain('ThemeToggle');
  });

  it('shows version information', () => {
    // Phase 7 i18n: version string uses translation key
    expect(settingsContent).toContain('screen.settings.about_version');
  });
});

describe('Rust Backend: Tauri Commands', () => {
  const libContent = readFileSync(LIB_RS, 'utf-8');

  it('registers send_message command', () => {
    expect(libContent).toContain('send_message');
  });

  it('registers get_ollama_status command', () => {
    expect(libContent).toContain('get_ollama_status');
  });

  it('registers select_model command', () => {
    expect(libContent).toContain('select_model');
  });

  it('registers start_indexing command', () => {
    expect(libContent).toContain('start_indexing');
  });

  it('registers get_action_log command', () => {
    expect(libContent).toContain('get_action_log');
  });

  it('registers get_privacy_status command', () => {
    expect(libContent).toContain('get_privacy_status');
  });

  it('registers set_user_name command', () => {
    expect(libContent).toContain('set_user_name');
  });

  it('registers get_user_name command', () => {
    expect(libContent).toContain('get_user_name');
  });

  it('registers set_autonomy_tier command', () => {
    expect(libContent).toContain('set_autonomy_tier');
  });

  it('registers get_autonomy_config command', () => {
    expect(libContent).toContain('get_autonomy_config');
  });

  it('registers get_knowledge_stats command', () => {
    expect(libContent).toContain('get_knowledge_stats');
  });

  it('registers get_chat_history command', () => {
    expect(libContent).toContain('get_chat_history');
  });

  it('registers set_onboarding_complete command', () => {
    expect(libContent).toContain('set_onboarding_complete');
  });

  it('registers get_onboarding_complete command', () => {
    expect(libContent).toContain('get_onboarding_complete');
  });

  // Event names are defined in the sidecar bridge (bridge.ts) and forwarded
  // dynamically by the Rust backend via format!("semblance://{}", event_name).
  // Verify the sidecar emits the expected events and Rust forwards them.
  it('Rust backend forwards sidecar events with semblance:// prefix', () => {
    expect(libContent).toContain('format!("semblance://{}"');
  });

  it('sidecar emits chat-token events', () => {
    const bridgeContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'), 'utf-8');
    expect(bridgeContent).toContain("'chat-token'");
  });

  it('sidecar emits chat-complete events', () => {
    const bridgeContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'), 'utf-8');
    expect(bridgeContent).toContain("'chat-complete'");
  });

  it('sidecar emits indexing-progress events', () => {
    const bridgeContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'), 'utf-8');
    expect(bridgeContent).toContain("'indexing-progress'");
  });

  it('sidecar emits indexing-complete events', () => {
    const bridgeContent = readFileSync(join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'), 'utf-8');
    expect(bridgeContent).toContain("'indexing-complete'");
  });

  it('has system tray configured', () => {
    expect(libContent).toContain('TrayIconBuilder');
    expect(libContent).toContain('Semblance');
  });

  it('does not use reqwest or hyper (no direct network from Rust)', () => {
    expect(libContent).not.toContain('use reqwest');
    expect(libContent).not.toContain('use hyper');
    expect(libContent).not.toContain('use std::net');
  });
});

describe('Navigation and Routing', () => {
  const appContent = readFileSync(APP_FILE, 'utf-8');

  it('has Chat navigation item', () => {
    expect(appContent).toContain("id: 'chat'");
  });

  it('has Files navigation item', () => {
    expect(appContent).toContain("id: 'files'");
  });

  it('has Activity navigation item', () => {
    expect(appContent).toContain("id: 'activity'");
  });

  it('has Privacy navigation item', () => {
    expect(appContent).toContain("id: 'privacy'");
  });

  it('renders Settings from footer', () => {
    expect(appContent).toContain("'settings'");
    expect(appContent).toContain('SettingsScreen');
  });

  it('renders PrivacyBadge in sidebar', () => {
    expect(appContent).toContain('PrivacyBadge');
  });

  it('renders ThemeToggle in sidebar', () => {
    expect(appContent).toContain('ThemeToggle');
  });
});

describe('User Name Display', () => {
  it('onboarding delegates naming to NamingMoment component', () => {
    const content = readFileSync(ONBOARDING_SCREEN, 'utf-8');
    expect(content).toContain('NamingMoment');
    expect(content).toContain('handleNamingMoment');
  });

  it('chat shows user name in empty state', () => {
    const content = readFileSync(CHAT_SCREEN, 'utf-8');
    // Phase 7 i18n: name interpolated via t() call
    expect(content).toContain('screen.chat.ask_anything');
    expect(content).toContain('userName');
  });

  it('settings allows editing name', () => {
    const content = readFileSync(SETTINGS_SCREEN, 'utf-8');
    expect(content).toContain('userName');
    expect(content).toContain('text-semblance-accent');
  });
});
