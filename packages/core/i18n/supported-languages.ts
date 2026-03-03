// Supported languages and OS locale detection for Semblance.
// Used by the LanguageSelect onboarding screen and Settings language picker.

export interface SupportedLanguage {
  code: string;
  nativeName: string;
  englishName: string;
  fontStack?: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', fontStack: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)', fontStack: '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif' },
  { code: 'zh-TW', nativeName: '繁體中文', englishName: 'Chinese (Traditional)', fontStack: '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', fontStack: '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
];

/**
 * Normalize a raw BCP 47 locale string to a supported language code.
 * Unknown locales fall back to 'en'.
 */
export function normalizeLocale(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh-hans') || lower === 'zh-cn') return 'zh-CN';
  if (lower.startsWith('zh-hant') || lower === 'zh-tw' || lower === 'zh-hk') return 'zh-TW';
  const base = lower.split('-')[0] ?? 'en';
  const match = SUPPORTED_LANGUAGES.find(l => l.code === base);
  return match ? match.code : 'en';
}

/**
 * Detect the OS locale from navigator.language and normalize it.
 * Always returns a valid code from SUPPORTED_LANGUAGES.
 */
export function detectOSLocale(): string {
  const osLocale = typeof navigator !== 'undefined' ? (navigator.language ?? 'en') : 'en';
  return normalizeLocale(osLocale);
}

/**
 * Find a SupportedLanguage by code. Falls back to English.
 */
export function findLanguage(code: string): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find(l => l.code === code) ?? SUPPORTED_LANGUAGES[0]!;
}
