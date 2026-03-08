// i18n configuration for desktop app.
// Direct imports ensure locale data is bundled by Vite in production.
// import.meta.glob with paths above the Vite root silently returns {} in production builds.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// ─── Direct locale imports (10 languages × 7 namespaces) ────────────────────

import en_common from '@semblance/ui/locales/en/common.json';
import en_onboarding from '@semblance/ui/locales/en/onboarding.json';
import en_morningBrief from '@semblance/ui/locales/en/morning-brief.json';
import en_connections from '@semblance/ui/locales/en/connections.json';
import en_settings from '@semblance/ui/locales/en/settings.json';
import en_privacy from '@semblance/ui/locales/en/privacy.json';
import en_agent from '@semblance/ui/locales/en/agent.json';

import de_common from '@semblance/ui/locales/de/common.json';
import de_onboarding from '@semblance/ui/locales/de/onboarding.json';
import de_morningBrief from '@semblance/ui/locales/de/morning-brief.json';
import de_connections from '@semblance/ui/locales/de/connections.json';
import de_settings from '@semblance/ui/locales/de/settings.json';
import de_privacy from '@semblance/ui/locales/de/privacy.json';
import de_agent from '@semblance/ui/locales/de/agent.json';

import es_common from '@semblance/ui/locales/es/common.json';
import es_onboarding from '@semblance/ui/locales/es/onboarding.json';
import es_morningBrief from '@semblance/ui/locales/es/morning-brief.json';
import es_connections from '@semblance/ui/locales/es/connections.json';
import es_settings from '@semblance/ui/locales/es/settings.json';
import es_privacy from '@semblance/ui/locales/es/privacy.json';
import es_agent from '@semblance/ui/locales/es/agent.json';

import fr_common from '@semblance/ui/locales/fr/common.json';
import fr_onboarding from '@semblance/ui/locales/fr/onboarding.json';
import fr_morningBrief from '@semblance/ui/locales/fr/morning-brief.json';
import fr_connections from '@semblance/ui/locales/fr/connections.json';
import fr_settings from '@semblance/ui/locales/fr/settings.json';
import fr_privacy from '@semblance/ui/locales/fr/privacy.json';
import fr_agent from '@semblance/ui/locales/fr/agent.json';

import it_common from '@semblance/ui/locales/it/common.json';
import it_onboarding from '@semblance/ui/locales/it/onboarding.json';
import it_morningBrief from '@semblance/ui/locales/it/morning-brief.json';
import it_connections from '@semblance/ui/locales/it/connections.json';
import it_settings from '@semblance/ui/locales/it/settings.json';
import it_privacy from '@semblance/ui/locales/it/privacy.json';
import it_agent from '@semblance/ui/locales/it/agent.json';

import ja_common from '@semblance/ui/locales/ja/common.json';
import ja_onboarding from '@semblance/ui/locales/ja/onboarding.json';
import ja_morningBrief from '@semblance/ui/locales/ja/morning-brief.json';
import ja_connections from '@semblance/ui/locales/ja/connections.json';
import ja_settings from '@semblance/ui/locales/ja/settings.json';
import ja_privacy from '@semblance/ui/locales/ja/privacy.json';
import ja_agent from '@semblance/ui/locales/ja/agent.json';

import ko_common from '@semblance/ui/locales/ko/common.json';
import ko_onboarding from '@semblance/ui/locales/ko/onboarding.json';
import ko_morningBrief from '@semblance/ui/locales/ko/morning-brief.json';
import ko_connections from '@semblance/ui/locales/ko/connections.json';
import ko_settings from '@semblance/ui/locales/ko/settings.json';
import ko_privacy from '@semblance/ui/locales/ko/privacy.json';
import ko_agent from '@semblance/ui/locales/ko/agent.json';

import pt_common from '@semblance/ui/locales/pt/common.json';
import pt_onboarding from '@semblance/ui/locales/pt/onboarding.json';
import pt_morningBrief from '@semblance/ui/locales/pt/morning-brief.json';
import pt_connections from '@semblance/ui/locales/pt/connections.json';
import pt_settings from '@semblance/ui/locales/pt/settings.json';
import pt_privacy from '@semblance/ui/locales/pt/privacy.json';
import pt_agent from '@semblance/ui/locales/pt/agent.json';

import zhCN_common from '@semblance/ui/locales/zh-CN/common.json';
import zhCN_onboarding from '@semblance/ui/locales/zh-CN/onboarding.json';
import zhCN_morningBrief from '@semblance/ui/locales/zh-CN/morning-brief.json';
import zhCN_connections from '@semblance/ui/locales/zh-CN/connections.json';
import zhCN_settings from '@semblance/ui/locales/zh-CN/settings.json';
import zhCN_privacy from '@semblance/ui/locales/zh-CN/privacy.json';
import zhCN_agent from '@semblance/ui/locales/zh-CN/agent.json';

import zhTW_common from '@semblance/ui/locales/zh-TW/common.json';
import zhTW_onboarding from '@semblance/ui/locales/zh-TW/onboarding.json';
import zhTW_morningBrief from '@semblance/ui/locales/zh-TW/morning-brief.json';
import zhTW_connections from '@semblance/ui/locales/zh-TW/connections.json';
import zhTW_settings from '@semblance/ui/locales/zh-TW/settings.json';
import zhTW_privacy from '@semblance/ui/locales/zh-TW/privacy.json';
import zhTW_agent from '@semblance/ui/locales/zh-TW/agent.json';

// ─── Build resources object ─────────────────────────────────────────────────

const resources = {
  en: { common: en_common, onboarding: en_onboarding, 'morning-brief': en_morningBrief, connections: en_connections, settings: en_settings, privacy: en_privacy, agent: en_agent },
  de: { common: de_common, onboarding: de_onboarding, 'morning-brief': de_morningBrief, connections: de_connections, settings: de_settings, privacy: de_privacy, agent: de_agent },
  es: { common: es_common, onboarding: es_onboarding, 'morning-brief': es_morningBrief, connections: es_connections, settings: es_settings, privacy: es_privacy, agent: es_agent },
  fr: { common: fr_common, onboarding: fr_onboarding, 'morning-brief': fr_morningBrief, connections: fr_connections, settings: fr_settings, privacy: fr_privacy, agent: fr_agent },
  it: { common: it_common, onboarding: it_onboarding, 'morning-brief': it_morningBrief, connections: it_connections, settings: it_settings, privacy: it_privacy, agent: it_agent },
  ja: { common: ja_common, onboarding: ja_onboarding, 'morning-brief': ja_morningBrief, connections: ja_connections, settings: ja_settings, privacy: ja_privacy, agent: ja_agent },
  ko: { common: ko_common, onboarding: ko_onboarding, 'morning-brief': ko_morningBrief, connections: ko_connections, settings: ko_settings, privacy: ko_privacy, agent: ko_agent },
  pt: { common: pt_common, onboarding: pt_onboarding, 'morning-brief': pt_morningBrief, connections: pt_connections, settings: pt_settings, privacy: pt_privacy, agent: pt_agent },
  'zh-CN': { common: zhCN_common, onboarding: zhCN_onboarding, 'morning-brief': zhCN_morningBrief, connections: zhCN_connections, settings: zhCN_settings, privacy: zhCN_privacy, agent: zhCN_agent },
  'zh-TW': { common: zhTW_common, onboarding: zhTW_onboarding, 'morning-brief': zhTW_morningBrief, connections: zhTW_connections, settings: zhTW_settings, privacy: zhTW_privacy, agent: zhTW_agent },
};

console.log('[i18n] Loaded resources:', Object.keys(resources).length, 'languages');

const NAMESPACES = ['common', 'onboarding', 'morning-brief', 'connections', 'settings', 'privacy', 'agent'] as const;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: navigator.language.split('-')[0] || 'en',
    fallbackLng: 'en',
    ns: [...NAMESPACES],
    defaultNS: 'common',
    initImmediate: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
