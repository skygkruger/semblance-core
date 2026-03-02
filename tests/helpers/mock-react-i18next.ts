/**
 * Mock react-i18next for vitest.
 *
 * Provides useTranslation, I18nextProvider, initReactI18next, Trans, and
 * withTranslation as lightweight stubs so components render without needing
 * the real react-i18next package resolved at the project root.
 *
 * useTranslation returns translation keys as-is (identity function).
 * I18nextProvider is a pass-through wrapper.
 * initReactI18next is a no-op i18next plugin.
 */

import React from 'react';

// Translation function — returns key as-is, with interpolation replaced
function t(key: string, options?: Record<string, unknown>): string {
  if (!options) return key;
  let result = key;
  for (const [k, v] of Object.entries(options)) {
    result = result.replace(`{{${k}}}`, String(v));
  }
  return result;
}

export function useTranslation(_ns?: string | string[]) {
  return {
    t,
    i18n: {
      language: 'en',
      changeLanguage: () => Promise.resolve(),
      isInitialized: true,
      use: () => ({ init: () => Promise.resolve() }),
      init: () => Promise.resolve(),
      exists: () => true,
      getFixedT: () => t,
      hasLoadedNamespace: () => true,
      loadNamespaces: () => Promise.resolve(),
      on: () => {},
      off: () => {},
    },
    ready: true,
  };
}

export function I18nextProvider({ children }: { children: React.ReactNode; i18n?: unknown }) {
  return React.createElement(React.Fragment, null, children);
}

export function Trans({ children, i18nKey }: { children?: React.ReactNode; i18nKey?: string; [key: string]: unknown }) {
  return React.createElement(React.Fragment, null, children ?? i18nKey ?? '');
}

export function withTranslation(_ns?: string) {
  return function <P extends object>(Component: React.ComponentType<P>) {
    return function WrappedComponent(props: P) {
      return React.createElement(Component, { ...props, t, i18n: { language: 'en' } } as P);
    };
  };
}

export const initReactI18next = {
  type: '3rdParty' as const,
  init: () => {},
};

export default {
  useTranslation,
  I18nextProvider,
  Trans,
  withTranslation,
  initReactI18next,
};
