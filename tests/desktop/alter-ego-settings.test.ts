import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

const src = readFileSync(
  join(ROOT, 'packages', 'semblance-ui', 'components', 'Settings', 'SettingsAlterEgo.web.tsx'),
  'utf-8',
);

describe('SettingsAlterEgo (structural)', () => {
  it('exports SettingsAlterEgo function', () => {
    expect(src).toContain('export function SettingsAlterEgo');
  });

  it('accepts dollarThreshold prop', () => {
    expect(src).toContain('dollarThreshold');
  });

  it('accepts confirmationDisabledCategories prop', () => {
    expect(src).toContain('confirmationDisabledCategories');
  });

  it('includes toggleable categories array with all 6 categories', () => {
    expect(src).toContain('toggleableCategories');
    const expectedCategories = [
      'email',
      'message',
      'calendar',
      'file',
      'financial_routine',
      'irreversible',
    ];
    for (const cat of expectedCategories) {
      expect(src).toContain(`'${cat}'`);
    }
  });

  it('includes warning text key for disabled confirmation', () => {
    expect(src).toContain('alter_ego.warning_no_confirmation');
  });

  it('includes hardcoded note about non-disableable categories', () => {
    expect(src).toContain('alter_ego.hardcoded_note');
    // Also verify the hardcoded categories are defined
    expect(src).toContain('financial_significant');
    expect(src).toContain('novel');
  });
});
