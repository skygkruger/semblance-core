// Intent State — Tests for AppState intent reducer actions, initial state,
// and intentProfile field presence.

import { describe, it, expect } from 'vitest';
import type { AppState } from '../../packages/desktop/src/state/AppState.js';
import { appReducer, initialState } from '../../packages/desktop/src/state/AppState.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

const appStateSource = readFile('packages/desktop/src/state/AppState.tsx');

const baseState: AppState = { ...initialState };

// ─── State Shape ───────────────────────────────────────────────────────────

describe('AppState — intentProfile in state interface', () => {
  it('defines intentProfile in AppState interface', () => {
    expect(appStateSource).toContain('intentProfile');
  });

  it('initial state has intentProfile with null primaryGoal', () => {
    expect(initialState.intentProfile).toBeDefined();
    expect(initialState.intentProfile.primaryGoal).toBeNull();
  });

  it('initial state has empty hardLimits array', () => {
    expect(initialState.intentProfile.hardLimits).toEqual([]);
  });

  it('initial state has empty personalValues array', () => {
    expect(initialState.intentProfile.personalValues).toEqual([]);
  });
});

// ─── Reducer Actions ───────────────────────────────────────────────────────

describe('AppState — SET_INTENT_PROFILE action', () => {
  it('SET_INTENT_PROFILE action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'SET_INTENT_PROFILE'");
  });

  it('sets the full intent profile', () => {
    const profile: AppState['intentProfile'] = {
      primaryGoal: 'Save 30 minutes a day',
      hardLimits: [{
        id: 'hl-1',
        rawText: 'Never email my ex',
        active: true,
        source: 'onboarding',
        createdAt: '2026-03-01T10:00:00.000Z',
      }],
      personalValues: [{
        id: 'pv-1',
        rawText: 'Family first',
        theme: 'family',
        active: true,
        source: 'onboarding',
        createdAt: '2026-03-01T10:00:00.000Z',
      }],
      lastUpdated: '2026-03-01T10:00:00.000Z',
    };
    const state = appReducer(baseState, { type: 'SET_INTENT_PROFILE', profile });
    expect(state.intentProfile.primaryGoal).toBe('Save 30 minutes a day');
    expect(state.intentProfile.hardLimits).toHaveLength(1);
    expect(state.intentProfile.personalValues).toHaveLength(1);
  });
});

describe('AppState — SET_PRIMARY_GOAL action', () => {
  it('SET_PRIMARY_GOAL action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'SET_PRIMARY_GOAL'");
  });

  it('sets the primary goal and updates lastUpdated', () => {
    const state = appReducer(baseState, { type: 'SET_PRIMARY_GOAL', goal: 'Automate my email' });
    expect(state.intentProfile.primaryGoal).toBe('Automate my email');
    expect(state.intentProfile.lastUpdated).not.toBeNull();
  });
});

describe('AppState — ADD_HARD_LIMIT action', () => {
  it('ADD_HARD_LIMIT action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'ADD_HARD_LIMIT'");
  });

  it('appends a hard limit', () => {
    const limit = { id: 'hl-1', rawText: 'Never send money', active: true, source: 'settings', createdAt: '2026-03-01T10:00:00.000Z' };
    const state = appReducer(baseState, { type: 'ADD_HARD_LIMIT', limit });
    expect(state.intentProfile.hardLimits).toHaveLength(1);
    expect(state.intentProfile.hardLimits[0]!.rawText).toBe('Never send money');
  });
});

describe('AppState — TOGGLE_HARD_LIMIT action', () => {
  it('TOGGLE_HARD_LIMIT action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'TOGGLE_HARD_LIMIT'");
  });

  it('toggles the active flag on a hard limit', () => {
    const limit = { id: 'hl-1', rawText: 'Never send money', active: true, source: 'settings', createdAt: '2026-03-01T10:00:00.000Z' };
    const withLimit = appReducer(baseState, { type: 'ADD_HARD_LIMIT', limit });
    const toggled = appReducer(withLimit, { type: 'TOGGLE_HARD_LIMIT', id: 'hl-1', active: false });
    expect(toggled.intentProfile.hardLimits[0]!.active).toBe(false);
  });
});

describe('AppState — REMOVE_HARD_LIMIT action', () => {
  it('REMOVE_HARD_LIMIT action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'REMOVE_HARD_LIMIT'");
  });

  it('removes a hard limit by id', () => {
    const limit = { id: 'hl-1', rawText: 'Never send money', active: true, source: 'settings', createdAt: '2026-03-01T10:00:00.000Z' };
    const withLimit = appReducer(baseState, { type: 'ADD_HARD_LIMIT', limit });
    const removed = appReducer(withLimit, { type: 'REMOVE_HARD_LIMIT', id: 'hl-1' });
    expect(removed.intentProfile.hardLimits).toHaveLength(0);
  });
});

describe('AppState — ADD_PERSONAL_VALUE and REMOVE_PERSONAL_VALUE actions', () => {
  it('ADD_PERSONAL_VALUE action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'ADD_PERSONAL_VALUE'");
  });

  it('REMOVE_PERSONAL_VALUE action type exists in reducer', () => {
    expect(appStateSource).toContain("case 'REMOVE_PERSONAL_VALUE'");
  });

  it('adds and removes a personal value', () => {
    const value = { id: 'pv-1', rawText: 'Honesty', theme: 'integrity', active: true, source: 'chat', createdAt: '2026-03-01T10:00:00.000Z' };
    const withValue = appReducer(baseState, { type: 'ADD_PERSONAL_VALUE', value });
    expect(withValue.intentProfile.personalValues).toHaveLength(1);
    expect(withValue.intentProfile.personalValues[0]!.rawText).toBe('Honesty');

    const removed = appReducer(withValue, { type: 'REMOVE_PERSONAL_VALUE', id: 'pv-1' });
    expect(removed.intentProfile.personalValues).toHaveLength(0);
  });
});
