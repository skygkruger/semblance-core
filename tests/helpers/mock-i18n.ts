/**
 * Mock i18n setup for component tests.
 * Returns translation keys as-is so tests can assert on key names.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Load real English locale for validation tests
import commonEn from '../../packages/semblance-ui/locales/en/common.json';
import onboardingEn from '../../packages/semblance-ui/locales/en/onboarding.json';
import settingsEn from '../../packages/semblance-ui/locales/en/settings.json';
import connectionsEn from '../../packages/semblance-ui/locales/en/connections.json';
import privacyEn from '../../packages/semblance-ui/locales/en/privacy.json';
import morningBriefEn from '../../packages/semblance-ui/locales/en/morning-brief.json';
import agentEn from '../../packages/semblance-ui/locales/en/agent.json';

const resources = {
  en: {
    common: commonEn,
    onboarding: onboardingEn,
    settings: settingsEn,
    connections: connectionsEn,
    privacy: privacyEn,
    'morning-brief': morningBriefEn,
    agent: agentEn,
  },
};

/**
 * Initialize a real i18n instance with English resources for test assertions.
 * Call once in beforeAll or at module scope.
 */
export async function initTestI18n(): Promise<typeof i18n> {
  if (i18n.isInitialized) return i18n;

  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'onboarding', 'settings', 'connections', 'privacy', 'morning-brief', 'agent'],
    defaultNS: 'common',
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return i18n;
}

export { i18n, resources };
