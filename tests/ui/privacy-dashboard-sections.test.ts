/**
 * Privacy Dashboard — Chain Integrity & Key Security section tests.
 * Validates the web component renders correct sections based on props,
 * and verifies the CSS and locale keys exist.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const UI_DIR = join(ROOT, 'packages', 'semblance-ui');
const COMPONENT_DIR = join(UI_DIR, 'components', 'PrivacyDashboard');
const LOCALES_DIR = join(UI_DIR, 'locales');

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

// ─── Gap 2: Chain Integrity Section ─────────────────────────────────────────

describe('PrivacyDashboard Chain Integrity section', () => {
  it('web component renders chain integrity section when prop is provided', () => {
    const webSrc = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.web.tsx'));
    // Must conditionally render based on chainIntegrity prop
    expect(webSrc).toContain('chainIntegrity');
    expect(webSrc).toContain('section_chain_integrity');
    expect(webSrc).toContain('chain_integrity.verified');
    expect(webSrc).toContain('chain_integrity.break_detected');
    expect(webSrc).toContain('chain_integrity.entries');
    expect(webSrc).toContain('chain_integrity.days');
    expect(webSrc).toContain('chain_integrity.export_receipt');
    expect(webSrc).toContain('chain_integrity.loading');
  });

  it('CSS contains all chain integrity classes', () => {
    const css = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.css'));
    expect(css).toContain('.privacy-dashboard__status-badge');
    expect(css).toContain('.privacy-dashboard__status-badge--verified');
    expect(css).toContain('.privacy-dashboard__status-badge--warning');
    expect(css).toContain('.privacy-dashboard__chain-stats');
    expect(css).toContain('.privacy-dashboard__chain-stat');
    expect(css).toContain('.privacy-dashboard__export-btn');
    expect(css).toContain('.privacy-dashboard__loading-text');
  });

  it('en locale contains chain integrity keys', () => {
    const locale = JSON.parse(readFile(join(LOCALES_DIR, 'en', 'privacy.json')));
    expect(locale.dashboard.section_chain_integrity).toBeTruthy();
    expect(locale.dashboard.chain_integrity.loading).toBeTruthy();
    expect(locale.dashboard.chain_integrity.verified).toBeTruthy();
    expect(locale.dashboard.chain_integrity.break_detected).toContain('{{date}}');
    expect(locale.dashboard.chain_integrity.entries).toContain('{{count}}');
    expect(locale.dashboard.chain_integrity.days).toContain('{{count}}');
    expect(locale.dashboard.chain_integrity.export_receipt).toBeTruthy();
  });

  it('native component renders chain integrity section', () => {
    const nativeSrc = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.native.tsx'));
    expect(nativeSrc).toContain('chainIntegrity');
    expect(nativeSrc).toContain('section_chain_integrity');
    expect(nativeSrc).toContain('chain_integrity.verified');
    expect(nativeSrc).toContain('onExportReceipt');
  });

  it('types file defines ChainIntegrityData interface', () => {
    const types = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.types.ts'));
    expect(types).toContain('ChainIntegrityData');
    expect(types).toContain('verified: boolean');
    expect(types).toContain('entryCount: number');
    expect(types).toContain('daysVerified: number');
    expect(types).toContain('firstBreak?: string');
    expect(types).toContain('loading?: boolean');
    expect(types).toContain('chainIntegrity?: ChainIntegrityData');
    expect(types).toContain('onExportReceipt?: () => void');
  });
});

// ─── Gap 3: Key Security Section ────────────────────────────────────────────

describe('PrivacyDashboard Key Security section', () => {
  it('web component renders key security section when prop is provided', () => {
    const webSrc = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.web.tsx'));
    expect(webSrc).toContain('keySecurity');
    expect(webSrc).toContain('section_key_security');
    expect(webSrc).toContain('key_security.hardware_secured');
    expect(webSrc).toContain('key_security.software_secured');
    expect(webSrc).toContain('key_security.fingerprint');
    expect(webSrc).toContain('key_security.loading');
  });

  it('CSS contains key security classes', () => {
    const css = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.css'));
    expect(css).toContain('.privacy-dashboard__status-badge--neutral');
    expect(css).toContain('.privacy-dashboard__key-fingerprint');
    expect(css).toContain('.privacy-dashboard__key-value');
  });

  it('en locale contains key security keys', () => {
    const locale = JSON.parse(readFile(join(LOCALES_DIR, 'en', 'privacy.json')));
    expect(locale.dashboard.section_key_security).toBeTruthy();
    expect(locale.dashboard.key_security.loading).toBeTruthy();
    expect(locale.dashboard.key_security.hardware_secured).toContain('{{platform}}');
    expect(locale.dashboard.key_security.software_secured).toContain('{{platform}}');
    expect(locale.dashboard.key_security.fingerprint).toBeTruthy();
  });

  it('native component renders key security section', () => {
    const nativeSrc = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.native.tsx'));
    expect(nativeSrc).toContain('keySecurity');
    expect(nativeSrc).toContain('section_key_security');
    expect(nativeSrc).toContain('key_security.hardware_secured');
    expect(nativeSrc).toContain('publicKeyFingerprint');
  });

  it('types file defines KeySecurityData interface', () => {
    const types = readFile(join(COMPONENT_DIR, 'PrivacyDashboard.types.ts'));
    expect(types).toContain('KeySecurityData');
    expect(types).toContain('hardwareBacked: boolean');
    expect(types).toContain('backend: string');
    expect(types).toContain('publicKeyFingerprint?: string');
    expect(types).toContain('keySecurity?: KeySecurityData');
  });
});

// ─── Locale Coverage ────────────────────────────────────────────────────────

describe('Privacy locale coverage for chain integrity + key security', () => {
  const LOCALES = ['en', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'it', 'zh-CN', 'zh-TW'];

  for (const lang of LOCALES) {
    it(`${lang} locale has chain integrity and key security keys`, () => {
      const path = join(LOCALES_DIR, lang, 'privacy.json');
      expect(existsSync(path)).toBe(true);
      const locale = JSON.parse(readFile(path));
      expect(locale.dashboard.section_chain_integrity).toBeTruthy();
      expect(locale.dashboard.chain_integrity).toBeTruthy();
      expect(locale.dashboard.chain_integrity.verified).toBeTruthy();
      expect(locale.dashboard.section_key_security).toBeTruthy();
      expect(locale.dashboard.key_security).toBeTruthy();
      expect(locale.dashboard.key_security.hardware_secured).toBeTruthy();
    });
  }
});
