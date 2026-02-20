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
const ONBOARDING_SCREEN = join(ROOT, 'packages', 'desktop', 'src', 'screens', 'OnboardingScreen.tsx');
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

  it('invokes send_message Tauri command', () => {
    expect(chatContent).toContain("invoke('send_message'");
  });

  it('appends streaming tokens to last message', () => {
    expect(chatContent).toContain('APPEND_TO_LAST_MESSAGE');
  });

  it('sets responding state during AI response', () => {
    expect(chatContent).toContain('SET_IS_RESPONDING');
  });

  it('has empty state with suggested questions', () => {
    expect(chatContent).toContain('chatMessages.length === 0');
    expect(chatContent).toContain('What topics are in my files');
  });
});

describe('Onboarding Flow', () => {
  const onboardingContent = readFileSync(ONBOARDING_SCREEN, 'utf-8');

  it('has all 8 steps', () => {
    expect(onboardingContent).toContain('TOTAL_STEPS = 8');
  });

  it('has Welcome screen (step 0)', () => {
    expect(onboardingContent).toContain('This is your Semblance');
  });

  it('has Promise screen (step 1)', () => {
    expect(onboardingContent).toContain('It will learn who you are');
    expect(onboardingContent).toContain('It will never share what it knows');
  });

  it('has Naming screen (step 2)', () => {
    expect(onboardingContent).toContain('What would you like to call it');
  });

  it('has Data Connection screen (step 3)', () => {
    expect(onboardingContent).toContain('to your world');
  });

  it('has File Selection screen (step 4)', () => {
    expect(onboardingContent).toContain('Choose folders');
  });

  it('has Knowledge Moment screen (step 5)', () => {
    expect(onboardingContent).toContain('exploring your documents');
  });

  it('has Autonomy screen (step 6)', () => {
    expect(onboardingContent).toContain('How much should');
    expect(onboardingContent).toContain('on its own');
  });

  it('has Ready screen (step 7)', () => {
    expect(onboardingContent).toContain('is ready');
  });

  it('persists user name via Tauri command', () => {
    expect(onboardingContent).toContain("invoke('set_user_name'");
  });

  it('persists onboarding completion via Tauri command', () => {
    expect(onboardingContent).toContain("invoke('set_onboarding_complete'");
  });

  it('persists autonomy config via Tauri command', () => {
    expect(onboardingContent).toContain("invoke('set_autonomy_tier'");
  });

  it('auto-advances Welcome after 2s', () => {
    expect(onboardingContent).toContain('setTimeout(advance, 2000)');
  });

  it('auto-advances Promise after 3s', () => {
    expect(onboardingContent).toContain('setTimeout(advance, 3000)');
  });

  it('uses crossfade transitions', () => {
    expect(onboardingContent).toContain('opacity-100');
    expect(onboardingContent).toContain('opacity-0');
  });

  it('shows name in accent color after confirmation', () => {
    expect(onboardingContent).toContain('text-semblance-accent');
  });

  it('uses DM Serif Display for headlines', () => {
    expect(onboardingContent).toContain('font-display');
  });
});

describe('Onboarding: Gating', () => {
  const appContent = readFileSync(APP_FILE, 'utf-8');

  it('shows onboarding when not complete', () => {
    expect(appContent).toContain('onboardingComplete');
    expect(appContent).toContain('OnboardingScreen');
  });

  it('shows main app layout when onboarding is complete', () => {
    expect(appContent).toContain('Navigation');
    expect(appContent).toContain('renderScreen');
  });
});

describe('Settings Screen', () => {
  const settingsContent = readFileSync(SETTINGS_SCREEN, 'utf-8');

  it('allows editing the Semblance name', () => {
    expect(settingsContent).toContain('set_user_name');
    expect(settingsContent).toContain('editingName');
  });

  it('shows Ollama connection status', () => {
    expect(settingsContent).toContain('ollamaStatus');
  });

  it('provides model selection', () => {
    expect(settingsContent).toContain('availableModels');
    expect(settingsContent).toContain('select_model');
  });

  it('includes autonomy configuration', () => {
    expect(settingsContent).toContain('AutonomySelector');
    expect(settingsContent).toContain('set_autonomy_tier');
  });

  it('includes theme toggle', () => {
    expect(settingsContent).toContain('ThemeToggle');
  });

  it('shows version information', () => {
    expect(settingsContent).toContain('v0.1.0');
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
  it('onboarding renders name in Warm Amber', () => {
    const content = readFileSync(ONBOARDING_SCREEN, 'utf-8');
    expect(content).toContain('text-semblance-accent');
    expect(content).toContain('{name}');
  });

  it('chat shows user name in empty state', () => {
    const content = readFileSync(CHAT_SCREEN, 'utf-8');
    expect(content).toContain('{name}');
    expect(content).toContain('text-semblance-accent');
  });

  it('settings allows editing name', () => {
    const content = readFileSync(SETTINGS_SCREEN, 'utf-8');
    expect(content).toContain('userName');
    expect(content).toContain('text-semblance-accent');
  });
});
