// i18n configuration for mobile app.
// Loads locale JSON files via dynamic import.
// Falls back to English.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

const NAMESPACES = ['common', 'onboarding', 'morning-brief', 'connections', 'settings', 'privacy', 'agent'] as const;

i18n
  .use(initReactI18next)
  .use(resourcesToBackend((language: string, namespace: string) =>
    // Metro bundles these at build time
    import(`@semblance/ui/locales/${language}/${namespace}.json`)
  ))
  .init({
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
