import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const src = readFileSync(
  join(ROOT, 'packages', 'desktop', 'src', 'state', 'AppState.tsx'),
  'utf-8',
);

describe('AppState alterEgo integration (structural)', () => {
  it('has alterEgoSettings in AppState interface', () => {
    // Verify the field exists in the interface definition
    expect(src).toContain('alterEgoSettings');
    // Verify it includes the expected shape
    expect(src).toContain('dollarThreshold');
    expect(src).toContain('confirmationDisabledCategories');
  });

  it('has SET_ALTER_EGO_SETTINGS action type', () => {
    expect(src).toContain("'SET_ALTER_EGO_SETTINGS'");
  });

  it('initial state has dollarThreshold of 50', () => {
    // Match the initialState object's alterEgoSettings block
    expect(src).toContain('dollarThreshold: 50');
  });

  it('initial state has empty confirmationDisabledCategories', () => {
    expect(src).toContain('confirmationDisabledCategories: []');
  });

  it('reducer handles SET_ALTER_EGO_SETTINGS', () => {
    // Verify the reducer has a case for this action
    expect(src).toContain("case 'SET_ALTER_EGO_SETTINGS'");
    expect(src).toContain('alterEgoSettings: action.settings');
  });
});
