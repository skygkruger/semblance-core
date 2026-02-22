// Tests for Commit 7: Mobile App Shell + Navigation.
// Verifies navigation structure, screen files, design token application,
// and component configuration.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const MOBILE_SRC = path.join(ROOT, 'packages/mobile/src');

// ─── File Structure ─────────────────────────────────────────────────────────

describe('Mobile App Shell — File Structure', () => {
  const requiredFiles = [
    'App.tsx',
    'theme/tokens.ts',
    'screens/InboxScreen.tsx',
    'screens/ChatScreen.tsx',
    'screens/CaptureScreen.tsx',
    'screens/SettingsScreen.tsx',
    'screens/OnboardingScreen.tsx',
    'navigation/types.ts',
    'navigation/TabNavigator.tsx',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(MOBILE_SRC, file))).toBe(true);
    });
  }
});

// ─── Design Tokens ──────────────────────────────────────────────────────────

describe('Mobile App Shell — Design Tokens', () => {
  it('tokens file exports colors matching DESIGN_SYSTEM.md', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'theme/tokens.ts'), 'utf-8');

    // Primary palette from DESIGN_SYSTEM.md
    expect(content).toContain('#1A1D2E'); // Deep Ink (bg-dark)
    expect(content).toContain('#4A7FBA'); // Semblance Blue (primary)
    expect(content).toContain('#E8A838'); // Warm Amber (accent)
    expect(content).toContain('#3DB87A'); // Living Green (success)
    expect(content).toContain('#E85D5D'); // Alert Coral (attention)
    expect(content).toContain('#8B93A7'); // Muted Slate (muted)
  });

  it('tokens file exports typography scales', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'theme/tokens.ts'), 'utf-8');

    expect(content).toContain('DM Serif Display');
    expect(content).toContain('Inter');
    expect(content).toContain('JetBrains Mono');
  });

  it('tokens file exports spacing values', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'theme/tokens.ts'), 'utf-8');

    expect(content).toContain('spacing');
    expect(content).toContain('radius');
    expect(content).toContain('motion');
  });
});

// ─── Navigation Structure ───────────────────────────────────────────────────

describe('Mobile App Shell — Navigation', () => {
  it('defines four tabs: Inbox, Chat, Capture, Settings', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'navigation/types.ts'), 'utf-8');

    expect(content).toContain('Inbox');
    expect(content).toContain('Chat');
    expect(content).toContain('Capture');
    expect(content).toContain('Settings');
  });

  it('defines root stack screens including Onboarding', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'navigation/types.ts'), 'utf-8');

    expect(content).toContain('Onboarding');
    expect(content).toContain('Main');
    expect(content).toContain('NetworkMonitor');
    expect(content).toContain('ActionLog');
  });

  it('TabNavigator includes all four screens', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'navigation/TabNavigator.tsx'), 'utf-8');

    expect(content).toContain('InboxScreen');
    expect(content).toContain('ChatScreen');
    expect(content).toContain('CaptureScreen');
    expect(content).toContain('SettingsScreen');
  });

  it('TabNavigator uses design system colors', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'navigation/TabNavigator.tsx'), 'utf-8');

    expect(content).toContain('colors.surface1Dark');
    expect(content).toContain('colors.borderDark');
    expect(content).toContain('colors.primary');
  });
});

// ─── Screen Contracts ───────────────────────────────────────────────────────

describe('Mobile App Shell — Screen Contracts', () => {
  it('InboxScreen exports InboxItem type and component', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'screens/InboxScreen.tsx'), 'utf-8');

    expect(content).toContain('export interface InboxItem');
    expect(content).toContain('export function InboxScreen');
    expect(content).toContain('FlatList');
    expect(content).toContain('RefreshControl');
  });

  it('ChatScreen exports ChatMessage type and component', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'screens/ChatScreen.tsx'), 'utf-8');

    expect(content).toContain('export interface ChatMessage');
    expect(content).toContain('export function ChatScreen');
    expect(content).toContain('KeyboardAvoidingView');
  });

  it('CaptureScreen exports CaptureEntry type and component', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'screens/CaptureScreen.tsx'), 'utf-8');

    expect(content).toContain('export interface CaptureEntry');
    expect(content).toContain('export function CaptureScreen');
    expect(content).toContain('TextInput');
  });

  it('SettingsScreen exports sections and component', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'screens/SettingsScreen.tsx'), 'utf-8');

    expect(content).toContain('export interface SettingsSection');
    expect(content).toContain('export function SettingsScreen');
    expect(content).toContain('ScrollView');
  });

  it('OnboardingScreen exports all step types', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'screens/OnboardingScreen.tsx'), 'utf-8');

    expect(content).toContain('naming');
    expect(content).toContain('hardware');
    expect(content).toContain('download-consent');
    expect(content).toContain('downloading');
    expect(content).toContain('first-inference');
    expect(content).toContain('knowledge-moment');
    expect(content).toContain('complete');
  });
});

// ─── App Root ───────────────────────────────────────────────────────────────

describe('Mobile App Shell — Root Component', () => {
  it('App.tsx imports all screens and navigation', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'App.tsx'), 'utf-8');

    expect(content).toContain('OnboardingScreen');
    expect(content).toContain('SimpleTabView');
    expect(content).toContain('StatusBar');
  });

  it('App.tsx uses dark status bar style', () => {
    const content = fs.readFileSync(path.join(MOBILE_SRC, 'App.tsx'), 'utf-8');

    expect(content).toContain('barStyle="light-content"');
    expect(content).toContain('colors.bgDark');
  });

  it('Screens have no network imports', () => {
    const screenFiles = [
      'screens/InboxScreen.tsx',
      'screens/ChatScreen.tsx',
      'screens/CaptureScreen.tsx',
      'screens/SettingsScreen.tsx',
      'screens/OnboardingScreen.tsx',
    ];

    for (const file of screenFiles) {
      const content = fs.readFileSync(path.join(MOBILE_SRC, file), 'utf-8');
      expect(content).not.toContain('fetch(');
      expect(content).not.toContain('XMLHttpRequest');
      expect(content).not.toContain('WebSocket');
    }
  });
});
