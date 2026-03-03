// LanguageSelect component + language preference IPC + AppState tests

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── LanguageSelect Component Structure ─────────────────────────────────────

describe('LanguageSelect web component', () => {
  const src = readFileSync(
    resolve('packages/semblance-ui/components/LanguageSelect/LanguageSelect.web.tsx'),
    'utf-8',
  );

  it('imports SUPPORTED_LANGUAGES from core/i18n', () => {
    expect(src).toContain("import { SUPPORTED_LANGUAGES, findLanguage }");
  });

  it('renders Wordmark', () => {
    expect(src).toContain('<Wordmark');
  });

  it('uses detectedCode prop for initial selection', () => {
    expect(src).toContain('findLanguage(detectedCode)');
  });

  it('maps SUPPORTED_LANGUAGES to buttons', () => {
    expect(src).toContain('SUPPORTED_LANGUAGES.map');
  });

  it('applies fontStack for CJK languages', () => {
    expect(src).toContain('lang.fontStack');
  });

  it('has localized continue button labels', () => {
    expect(src).toContain('CONTINUE_LABELS');
    expect(src).toContain("'続ける'"); // Japanese
    expect(src).toContain("'继续'"); // zh-CN
    expect(src).toContain("'계속'"); // Korean
  });

  it('calls onConfirm with selected code', () => {
    expect(src).toContain('onConfirm(selected)');
  });

  it('shows Veridian selection indicator', () => {
    expect(src).toContain('#6ECFA3');
  });
});

describe('LanguageSelect native component', () => {
  const src = readFileSync(
    resolve('packages/semblance-ui/components/LanguageSelect/LanguageSelect.native.tsx'),
    'utf-8',
  );

  it('uses FlatList for the language list', () => {
    expect(src).toContain('FlatList');
  });

  it('imports brandColors from native tokens', () => {
    expect(src).toContain("from '../../tokens/native'");
    expect(src).toContain('brandColors');
  });

  it('has localized continue button labels', () => {
    expect(src).toContain('CONTINUE_LABELS');
  });

  it('uses Pressable for list items', () => {
    expect(src).toContain('Pressable');
  });

  it('has Veridian selection color', () => {
    expect(src).toContain('brandColors.veridian');
  });
});

describe('LanguageSelect types', () => {
  const src = readFileSync(
    resolve('packages/semblance-ui/components/LanguageSelect/LanguageSelect.types.ts'),
    'utf-8',
  );

  it('exports LanguageSelectProps with detectedCode and onConfirm', () => {
    expect(src).toContain('detectedCode: string');
    expect(src).toContain('onConfirm: (code: string) => void');
  });
});

// ─── OnboardingFlow Wiring ──────────────────────────────────────────────────

describe('OnboardingFlow language-select step', () => {
  const desktopFlow = readFileSync(
    resolve('packages/desktop/src/screens/OnboardingFlow.tsx'),
    'utf-8',
  );

  it('imports LanguageSelect from @semblance/ui', () => {
    expect(desktopFlow).toContain('LanguageSelect');
  });

  it('imports detectOSLocale', () => {
    expect(desktopFlow).toContain('detectOSLocale');
  });

  it('imports setLanguagePreference from IPC commands', () => {
    expect(desktopFlow).toContain('setLanguagePreference');
  });

  it('has language-select as first step in STEP_ORDER', () => {
    const stepOrderMatch = desktopFlow.match(/STEP_ORDER.*?\[([^\]]+)\]/s);
    expect(stepOrderMatch).toBeTruthy();
    const firstStep = stepOrderMatch![1]!.trim().split(/\s*,\s*/)[0];
    expect(firstStep).toContain('language-select');
  });

  it('renders LanguageSelect when step is language-select', () => {
    expect(desktopFlow).toContain("step === 'language-select'");
    expect(desktopFlow).toContain('<LanguageSelect');
  });

  it('dispatches SET_LANGUAGE action', () => {
    expect(desktopFlow).toContain("type: 'SET_LANGUAGE'");
  });

  it('calls i18n.changeLanguage', () => {
    expect(desktopFlow).toContain('i18n.changeLanguage(code)');
  });
});

describe('Mobile OnboardingFlow language-select step', () => {
  const mobileFlow = readFileSync(
    resolve('packages/mobile/src/screens/OnboardingFlow.tsx'),
    'utf-8',
  );

  it('imports LanguageSelect from @semblance/ui', () => {
    expect(mobileFlow).toContain('LanguageSelect');
  });

  it('imports detectOSLocale', () => {
    expect(mobileFlow).toContain('detectOSLocale');
  });

  it('has language-select as first step in STEP_ORDER', () => {
    const stepOrderMatch = mobileFlow.match(/STEP_ORDER.*?\[([^\]]+)\]/s);
    expect(stepOrderMatch).toBeTruthy();
    const firstStep = stepOrderMatch![1]!.trim().split(/\s*,\s*/)[0];
    expect(firstStep).toContain('language-select');
  });

  it('renders LanguageSelect when step is language-select', () => {
    expect(mobileFlow).toContain("step === 'language-select'");
    expect(mobileFlow).toContain('<LanguageSelect');
  });
});

// ─── AppState Language Field ────────────────────────────────────────────────

describe('AppState language support', () => {
  const appState = readFileSync(
    resolve('packages/desktop/src/state/AppState.tsx'),
    'utf-8',
  );

  it('AppState interface has language field', () => {
    expect(appState).toContain('language: string');
  });

  it('AppAction has SET_LANGUAGE action', () => {
    expect(appState).toContain('SET_LANGUAGE');
  });

  it('initialState has language default', () => {
    expect(appState).toContain("language: 'en'");
  });

  it('reducer handles SET_LANGUAGE', () => {
    expect(appState).toContain("case 'SET_LANGUAGE'");
  });
});

// ─── IPC Commands ───────────────────────────────────────────────────────────

describe('Language preference IPC commands', () => {
  const commands = readFileSync(
    resolve('packages/desktop/src/ipc/commands.ts'),
    'utf-8',
  );

  it('has getLanguagePreference command', () => {
    expect(commands).toContain('getLanguagePreference');
    expect(commands).toContain("'get_language_preference'");
  });

  it('has setLanguagePreference command', () => {
    expect(commands).toContain('setLanguagePreference');
    expect(commands).toContain("'set_language_preference'");
  });
});

// ─── Bridge Handlers ────────────────────────────────────────────────────────

describe('Bridge language handlers', () => {
  const bridge = readFileSync(
    resolve('packages/desktop/src-tauri/sidecar/bridge.ts'),
    'utf-8',
  );

  it('has language:get handler', () => {
    expect(bridge).toContain("case 'language:get'");
  });

  it('has language:set handler', () => {
    expect(bridge).toContain("case 'language:set'");
  });

  it('uses getPref/setPref for persistence', () => {
    expect(bridge).toContain("getPref('language')");
    expect(bridge).toContain("setPref('language'");
  });
});

// ─── Rust Commands ──────────────────────────────────────────────────────────

describe('Rust Tauri language commands', () => {
  const lib = readFileSync(
    resolve('packages/desktop/src-tauri/src/lib.rs'),
    'utf-8',
  );

  it('has get_language_preference command', () => {
    expect(lib).toContain('fn get_language_preference');
  });

  it('has set_language_preference command', () => {
    expect(lib).toContain('fn set_language_preference');
  });

  it('commands are registered in generate_handler', () => {
    expect(lib).toContain('get_language_preference');
    expect(lib).toContain('set_language_preference');
  });
});

// ─── Export Wiring ──────────────────────────────────────────────────────────

describe('LanguageSelect export wiring', () => {
  it('barrel index exports LanguageSelect', () => {
    const barrel = readFileSync(
      resolve('packages/semblance-ui/components/LanguageSelect/index.ts'),
      'utf-8',
    );
    expect(barrel).toContain("export { LanguageSelect }");
    expect(barrel).toContain("export type { LanguageSelectProps }");
  });

  it('main semblance-ui index exports LanguageSelect', () => {
    const main = readFileSync(
      resolve('packages/semblance-ui/index.ts'),
      'utf-8',
    );
    expect(main).toContain('LanguageSelect');
    expect(main).toContain('LanguageSelectProps');
  });
});
