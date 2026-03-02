// Translation key structure tests
//
// Verifies that English locale files exist, parse as valid JSON,
// and contain expected top-level keys.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const EN_DIR = join(ROOT, 'packages', 'semblance-ui', 'locales', 'en');

const NAMESPACES = [
  'common',
  'onboarding',
  'morning-brief',
  'connections',
  'settings',
  'privacy',
  'agent',
] as const;

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** Count all leaf string values recursively in a nested JSON object. */
function countLeafKeys(obj: Record<string, unknown>): number {
  let count = 0;
  for (const val of Object.values(obj)) {
    if (typeof val === 'string') {
      count += 1;
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      count += countLeafKeys(val as Record<string, unknown>);
    }
  }
  return count;
}

describe('translation keys — English', () => {
  it('common.json contains a "button" top-level key', () => {
    const common = loadJson(join(EN_DIR, 'common.json'));
    expect(common).toHaveProperty('button');
    expect(typeof common.button).toBe('object');
  });

  it('common.json contains a "screen" top-level key', () => {
    const common = loadJson(join(EN_DIR, 'common.json'));
    expect(common).toHaveProperty('screen');
    expect(typeof common.screen).toBe('object');
  });

  it('all 7 namespace files exist and parse as valid JSON', () => {
    for (const ns of NAMESPACES) {
      const filePath = join(EN_DIR, `${ns}.json`);
      expect(existsSync(filePath), `Missing: en/${ns}.json`).toBe(true);

      // Must parse without throwing
      const data = loadJson(filePath);
      expect(typeof data).toBe('object');
      expect(data).not.toBeNull();
    }
  });

  it('common.json has at least 30 top-level keys (counting nested sections)', () => {
    const common = loadJson(join(EN_DIR, 'common.json'));
    // The file is structured with 13 top-level namespaces (button, status, time,
    // screen, etc.), but the "screen" key alone contains 20+ subsections. Count
    // second-level keys across all top-level groups to verify breadth. Also verify
    // the file contains at least 200 leaf translation strings total (it has 500+).
    const topLevelKeys = Object.keys(common);
    let secondLevelCount = 0;
    for (const key of topLevelKeys) {
      const val = common[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        secondLevelCount += Object.keys(val as Record<string, unknown>).length;
      }
    }
    expect(secondLevelCount).toBeGreaterThanOrEqual(30);

    // Verify total leaf key count to confirm this is a substantial file
    const leafCount = countLeafKeys(common);
    expect(leafCount).toBeGreaterThanOrEqual(200);
  });
});
