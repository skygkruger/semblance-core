import React from 'react';
import type { Preview } from '@storybook/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import '../tokens/tokens.css';
import '../tokens/fonts.css';
import '../tokens/opal.css';
import { DotMatrix } from '../components/DotMatrix/DotMatrix';
import common from '../locales/en/common.json';
import onboarding from '../locales/en/onboarding.json';
import morningBrief from '../locales/en/morning-brief.json';
import connections from '../locales/en/connections.json';
import settings from '../locales/en/settings.json';
import privacy from '../locales/en/privacy.json';
import agent from '../locales/en/agent.json';

i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common', 'onboarding', 'morning-brief', 'connections', 'settings', 'privacy', 'agent'],
  defaultNS: 'common',
  resources: { en: { common, onboarding, 'morning-brief': morningBrief, connections, settings, privacy, agent } },
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

const preview: Preview = {
  parameters: {
    backgrounds: { disable: true },
    viewport: {
      viewports: {
        mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' } },
        tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop', styles: { width: '1280px', height: '900px' } },
        wide: { name: 'Wide', styles: { width: '1440px', height: '900px' } },
      },
    },
  },
  decorators: [
    (Story) =>
      React.createElement(
        'div',
        { style: { position: 'relative', minHeight: '100vh', background: '#0B0E11' } },
        React.createElement(DotMatrix, null),
        React.createElement(
          'div',
          { style: { position: 'relative', zIndex: 1, padding: '2rem' } },
          React.createElement(Story, null),
        ),
      ),
  ],
};

export default preview;
