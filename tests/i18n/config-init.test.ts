// i18n configuration initialization tests
//
// Verifies that desktop and mobile i18n config files exist
// and contain the correct imports and configuration values.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DESKTOP_CONFIG = join(ROOT, 'packages', 'desktop', 'src', 'i18n', 'config.ts');
const MOBILE_CONFIG = join(ROOT, 'packages', 'mobile', 'src', 'i18n', 'config.ts');

describe('i18n config — desktop', () => {
  const content = readFileSync(DESKTOP_CONFIG, 'utf8');

  it('imports i18next, initReactI18next, and resourcesToBackend', () => {
    expect(content).toContain("from 'i18next'");
    expect(content).toContain("initReactI18next");
    expect(content).toContain("resourcesToBackend");
  });

  it('sets defaultNS to common and fallbackLng to en', () => {
    expect(content).toMatch(/defaultNS:\s*['"]common['"]/);
    expect(content).toMatch(/fallbackLng:\s*['"]en['"]/);
  });
});

describe('i18n config — mobile', () => {
  const content = readFileSync(MOBILE_CONFIG, 'utf8');

  it('imports i18next, initReactI18next, and resourcesToBackend', () => {
    expect(content).toContain("from 'i18next'");
    expect(content).toContain("initReactI18next");
    expect(content).toContain("resourcesToBackend");
  });

  it('sets fallbackLng to en and useSuspense to false', () => {
    expect(content).toMatch(/fallbackLng:\s*['"]en['"]/);
    expect(content).toMatch(/useSuspense:\s*false/);
  });
});
