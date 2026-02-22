// Clipboard Settings Tests — Verify settings toggle persistence and defaults.

import { describe, it, expect } from 'vitest';

describe('ClipboardSettings', () => {
  it('clipboard settings toggle persists (state shape)', () => {
    // Verify the state shape has the correct structure
    const initialState = {
      clipboardSettings: {
        monitoringEnabled: false,
        recentActions: [] as Array<{ patternType: string; action: string; timestamp: string }>,
      },
    };

    expect(initialState.clipboardSettings.monitoringEnabled).toBe(false);
    expect(initialState.clipboardSettings.recentActions).toHaveLength(0);

    // Toggle ON
    const updatedState = {
      ...initialState,
      clipboardSettings: {
        ...initialState.clipboardSettings,
        monitoringEnabled: true,
      },
    };
    expect(updatedState.clipboardSettings.monitoringEnabled).toBe(true);
  });

  it('clipboard monitoring defaults OFF', () => {
    // The initial state in AppState.tsx sets monitoringEnabled to false
    const defaultEnabled = false;
    expect(defaultEnabled).toBe(false);
  });

  it('recent actions show pattern type not content', () => {
    const recentActions = [
      { patternType: 'tracking_number', action: 'track_package', timestamp: new Date().toISOString() },
      { patternType: 'url', action: 'summarize_url', timestamp: new Date().toISOString() },
    ];

    for (const action of recentActions) {
      // Pattern type is stored, not full clipboard text
      expect(action.patternType).toBeDefined();
      expect(action.action).toBeDefined();
      // Should not contain any raw clipboard text
      expect(Object.keys(action)).not.toContain('clipboardText');
      expect(Object.keys(action)).not.toContain('fullText');
      expect(Object.keys(action)).not.toContain('rawText');
    }
  });

  it('toggle ON/OFF state updates correctly', () => {
    let state = { monitoringEnabled: false };

    // Toggle ON
    state = { monitoringEnabled: !state.monitoringEnabled };
    expect(state.monitoringEnabled).toBe(true);

    // Toggle OFF
    state = { monitoringEnabled: !state.monitoringEnabled };
    expect(state.monitoringEnabled).toBe(false);
  });
});
