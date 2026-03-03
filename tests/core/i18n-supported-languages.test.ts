// i18n supported-languages tests — normalizeLocale, detectOSLocale, findLanguage, SUPPORTED_LANGUAGES

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  normalizeLocale,
  detectOSLocale,
  findLanguage,
} from '../../packages/core/i18n/supported-languages.js';
import type { SupportedLanguage } from '../../packages/core/i18n/supported-languages.js';

// ─── SUPPORTED_LANGUAGES array ──────────────────────────────────────────────

describe('SUPPORTED_LANGUAGES', () => {
  it('contains exactly 10 languages', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(10);
  });

  it('has English as the first entry', () => {
    expect(SUPPORTED_LANGUAGES[0]?.code).toBe('en');
  });

  it('every language has code, nativeName, and englishName', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(lang.code).toBeTruthy();
      expect(lang.nativeName).toBeTruthy();
      expect(lang.englishName).toBeTruthy();
    }
  });

  it('codes are unique', () => {
    const codes = SUPPORTED_LANGUAGES.map(l => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('CJK languages have fontStack defined', () => {
    const cjk = ['ja', 'zh-CN', 'zh-TW', 'ko'];
    for (const code of cjk) {
      const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
      expect(lang?.fontStack).toBeTruthy();
    }
  });

  it('Latin languages do not have fontStack', () => {
    const latin = ['en', 'es', 'de', 'pt', 'fr', 'it'];
    for (const code of latin) {
      const lang = SUPPORTED_LANGUAGES.find(l => l.code === code);
      expect(lang?.fontStack).toBeUndefined();
    }
  });
});

// ─── normalizeLocale ────────────────────────────────────────────────────────

describe('normalizeLocale', () => {
  it('normalizes en-US to en', () => {
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('normalizes en-GB to en', () => {
    expect(normalizeLocale('en-GB')).toBe('en');
  });

  it('normalizes es-MX to es', () => {
    expect(normalizeLocale('es-MX')).toBe('es');
  });

  it('normalizes zh-Hans to zh-CN', () => {
    expect(normalizeLocale('zh-Hans')).toBe('zh-CN');
  });

  it('normalizes zh-Hans-CN to zh-CN', () => {
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh-CN');
  });

  it('normalizes zh-CN to zh-CN', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
  });

  it('normalizes zh-Hant to zh-TW', () => {
    expect(normalizeLocale('zh-Hant')).toBe('zh-TW');
  });

  it('normalizes zh-Hant-TW to zh-TW', () => {
    expect(normalizeLocale('zh-Hant-TW')).toBe('zh-TW');
  });

  it('normalizes zh-HK to zh-TW', () => {
    expect(normalizeLocale('zh-HK')).toBe('zh-TW');
  });

  it('normalizes ko-KR to ko', () => {
    expect(normalizeLocale('ko-KR')).toBe('ko');
  });

  it('normalizes ja-JP to ja', () => {
    expect(normalizeLocale('ja-JP')).toBe('ja');
  });

  it('normalizes pt-BR to pt', () => {
    expect(normalizeLocale('pt-BR')).toBe('pt');
  });

  it('normalizes fr-CA to fr', () => {
    expect(normalizeLocale('fr-CA')).toBe('fr');
  });

  it('normalizes de-AT to de', () => {
    expect(normalizeLocale('de-AT')).toBe('de');
  });

  it('normalizes it-IT to it', () => {
    expect(normalizeLocale('it-IT')).toBe('it');
  });

  it('returns en for unknown locale', () => {
    expect(normalizeLocale('xx-YY')).toBe('en');
  });

  it('returns en for empty string', () => {
    expect(normalizeLocale('')).toBe('en');
  });

  it('handles case insensitivity', () => {
    expect(normalizeLocale('EN-US')).toBe('en');
    expect(normalizeLocale('ZH-HANS')).toBe('zh-CN');
    expect(normalizeLocale('JA-JP')).toBe('ja');
  });
});

// ─── detectOSLocale ─────────────────────────────────────────────────────────

describe('detectOSLocale', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns normalized locale from navigator.language', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'ja-JP' },
      writable: true,
      configurable: true,
    });
    expect(detectOSLocale()).toBe('ja');
  });

  it('returns en when navigator is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(detectOSLocale()).toBe('en');
  });

  it('handles zh-Hans browser locale', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: 'zh-Hans-CN' },
      writable: true,
      configurable: true,
    });
    expect(detectOSLocale()).toBe('zh-CN');
  });
});

// ─── findLanguage ───────────────────────────────────────────────────────────

describe('findLanguage', () => {
  it('finds English by code', () => {
    const lang = findLanguage('en');
    expect(lang.code).toBe('en');
    expect(lang.englishName).toBe('English');
  });

  it('finds Japanese by code', () => {
    const lang = findLanguage('ja');
    expect(lang.code).toBe('ja');
    expect(lang.nativeName).toBe('日本語');
  });

  it('finds zh-CN by code', () => {
    const lang = findLanguage('zh-CN');
    expect(lang.code).toBe('zh-CN');
    expect(lang.nativeName).toBe('简体中文');
  });

  it('finds zh-TW by code', () => {
    const lang = findLanguage('zh-TW');
    expect(lang.code).toBe('zh-TW');
    expect(lang.nativeName).toBe('繁體中文');
  });

  it('finds Korean by code', () => {
    const lang = findLanguage('ko');
    expect(lang.code).toBe('ko');
    expect(lang.nativeName).toBe('한국어');
  });

  it('returns English for unknown code', () => {
    const lang = findLanguage('xx');
    expect(lang.code).toBe('en');
  });

  it('returns English for empty string', () => {
    const lang = findLanguage('');
    expect(lang.code).toBe('en');
  });

  it('returns correct type shape', () => {
    const lang: SupportedLanguage = findLanguage('es');
    expect(lang.code).toBe('es');
    expect(lang.nativeName).toBe('Español');
    expect(lang.englishName).toBe('Spanish');
    expect(lang.fontStack).toBeUndefined();
  });
});
