// i18n configuration for desktop app.
// Loads locale JSON files via eager glob import — resources are added
// synchronously so translations are available on first render.
// Falls back to English. Detects language from navigator.language.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const NAMESPACES = ['common', 'onboarding', 'morning-brief', 'connections', 'settings', 'privacy', 'agent'] as const;

// Vite glob import — resolves all locale JSON at build time.
// The relative path must be used (not @semblance/ui alias) for Vite glob to work.
const localeModules = import.meta.glob(
  '../../../semblance-ui/locales/**/*.json',
  { eager: true }
) as Record<string, { default?: Record<string, unknown> } | Record<string, unknown>>;

// Build the resources object synchronously from glob results.
// This avoids the async timing issue with resourcesToBackend.
const resources: Record<string, Record<string, Record<string, unknown>>> = {};

for (const [path, mod] of Object.entries(localeModules)) {
  // path format: ../../../semblance-ui/locales/{lang}/{namespace}.json
  const match = path.match(/locales\/([^/]+)\/([^/]+)\.json$/);
  if (match) {
    const lang = match[1]!;
    const ns = match[2]!;
    if (!resources[lang]) resources[lang] = {};
    // Vite eager JSON: module is { default: { ... } } or the object itself
    const data = (mod as { default?: Record<string, unknown> }).default ?? mod;
    resources[lang]![ns] = data as Record<string, unknown>;
  }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: navigator.language.split('-')[0] || 'en',
    fallbackLng: 'en',
    ns: [...NAMESPACES],
    defaultNS: 'common',
    // Resources are already loaded synchronously via Vite glob — no backend needed.
    // Force synchronous init so translations are available on first render.
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
