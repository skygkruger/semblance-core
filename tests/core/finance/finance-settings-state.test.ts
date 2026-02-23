/**
 * Step 19 — Finance settings AppState tests.
 * Initial state defaults, reducer updates.
 */

import { describe, it, expect } from 'vitest';
import { initialState, appReducer } from '@semblance/desktop/state/AppState';

describe('Finance Settings State (Step 19)', () => {
  it('initial state has correct finance defaults', () => {
    expect(initialState.financeSettings).toBeDefined();
    expect(initialState.financeSettings.plaidConnected).toBe(false);
    expect(initialState.financeSettings.autoSyncEnabled).toBe(false);
    expect(initialState.financeSettings.anomalySensitivity).toBe('medium');
    expect(initialState.financeSettings.lastImportAt).toBeNull();
    expect(initialState.financeSettings.connectedAccounts).toEqual([]);
  });

  it('SET_FINANCE_SETTINGS reducer updates state', () => {
    const newSettings = {
      plaidConnected: true,
      autoSyncEnabled: true,
      anomalySensitivity: 'high' as const,
      lastImportAt: '2026-01-20T12:00:00Z',
      connectedAccounts: [
        { id: 'acc-1', name: 'Checking', institution: 'Chase', type: 'depository' },
      ],
    };

    const newState = appReducer(initialState, {
      type: 'SET_FINANCE_SETTINGS',
      settings: newSettings,
    });

    expect(newState.financeSettings.plaidConnected).toBe(true);
    expect(newState.financeSettings.autoSyncEnabled).toBe(true);
    expect(newState.financeSettings.anomalySensitivity).toBe('high');
    expect(newState.financeSettings.lastImportAt).toBe('2026-01-20T12:00:00Z');
    expect(newState.financeSettings.connectedAccounts).toHaveLength(1);
    expect(newState.financeSettings.connectedAccounts[0]!.name).toBe('Checking');
  });
});
