/**
 * Mobile Tab Navigation Tests
 *
 * Static analysis validating:
 * - TabNavigator.tsx exists and imports from @react-navigation/bottom-tabs
 * - TabNavigator.tsx defines 5 tabs (Chat, Brief, Knowledge, Privacy, Settings)
 * - Mobile App.tsx wraps with NavigationContainer and SafeAreaProvider
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const TAB_NAV_PATH = join(ROOT, 'packages', 'mobile', 'src', 'navigation', 'TabNavigator.tsx');
const MOBILE_APP_PATH = join(ROOT, 'packages', 'mobile', 'src', 'App.tsx');

describe('Mobile Tab Navigation', () => {
  it('TabNavigator.tsx exists and imports from @react-navigation/bottom-tabs', () => {
    expect(existsSync(TAB_NAV_PATH)).toBe(true);
    const content = readFileSync(TAB_NAV_PATH, 'utf-8');
    expect(content).toContain("from '@react-navigation/bottom-tabs'");
    expect(content).toContain('createBottomTabNavigator');
  });

  it('TabNavigator.tsx defines 5 tabs: Chat, Brief, Knowledge, Privacy, Settings', () => {
    const content = readFileSync(TAB_NAV_PATH, 'utf-8');

    // Check for Tab.Screen definitions or tab labels
    const tabScreenMatches = content.match(/Tab\.Screen/g);
    expect(tabScreenMatches).not.toBeNull();
    expect(tabScreenMatches!.length).toBe(5);

    // Verify each tab name/label is present
    const expectedTabs = ['Chat', 'Brief', 'Knowledge', 'Privacy', 'Settings'];
    for (const tab of expectedTabs) {
      expect(content).toContain(`tabBarLabel: '${tab}'`);
    }
  });

  it('Mobile App.tsx wraps with NavigationContainer and SafeAreaProvider', () => {
    expect(existsSync(MOBILE_APP_PATH)).toBe(true);
    const content = readFileSync(MOBILE_APP_PATH, 'utf-8');
    expect(content).toContain('NavigationContainer');
    expect(content).toContain('SafeAreaProvider');
    expect(content).toContain("from '@react-navigation/native'");
    expect(content).toContain("from 'react-native-safe-area-context'");
  });
});
