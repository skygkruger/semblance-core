// i18n configuration for desktop app.
// Loads locale JSON files via dynamic import (resourcesToBackend).
// Falls back to English. Detects language from navigator.language.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

const NAMESPACES = ['common', 'onboarding', 'morning-brief', 'connections', 'settings', 'privacy', 'agent'] as const;

i18n
  .use(initReactI18next)
  .use(resourcesToBackend((language: string, namespace: string) =>
    import(`@semblance/ui/locales/${language}/${namespace}.json`)
  ))
  .init({
    lng: navigator.language.split('-')[0] || 'en',
    fallbackLng: 'en',
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
