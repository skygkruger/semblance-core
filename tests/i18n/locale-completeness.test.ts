// Locale completeness tests
//
// Verifies that all 10 locales exist with the correct namespace files,
// and that non-English locales have the same top-level keys as English.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const LOCALES_DIR = join(ROOT, 'packages', 'semblance-ui', 'locales');

const ALL_LOCALES = ['en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'zh-CN', 'zh-TW'] as const;

const NAMESPACES = [
  'common',
  'onboarding',
  'morning-brief',
  'connections',
  'settings',
  'privacy',
  'agent',
] as const;

const EXPECTED_FILES = NAMESPACES.map((ns) => `${ns}.json`).sort();

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

describe('locale completeness', () => {
  it('all 10 locale directories exist', () => {
    for (const locale of ALL_LOCALES) {
      const localeDir = join(LOCALES_DIR, locale);
      expect(existsSync(localeDir), `Missing locale directory: ${locale}`).toBe(true);
    }
  });

  it('each locale has exactly 7 namespace files', () => {
    for (const locale of ALL_LOCALES) {
      const localeDir = join(LOCALES_DIR, locale);
      const files = readdirSync(localeDir)
        .filter((f) => f.endsWith('.json'))
        .sort();

      expect(files, `${locale} should have exactly 7 namespace files`).toEqual(EXPECTED_FILES);
    }
  });

  it('non-English common.json files have the same top-level keys as English', () => {
    const enCommon = loadJson(join(LOCALES_DIR, 'en', 'common.json'));
    const enKeys = Object.keys(enCommon).sort();

    for (const locale of ALL_LOCALES) {
      if (locale === 'en') continue;

      const localeCommon = loadJson(join(LOCALES_DIR, locale, 'common.json'));
      const localeKeys = Object.keys(localeCommon).sort();

      expect(localeKeys, `${locale}/common.json top-level keys should match en`).toEqual(enKeys);
    }
  });
});
