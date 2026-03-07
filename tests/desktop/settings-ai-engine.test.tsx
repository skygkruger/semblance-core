// Settings AI Engine section — structural verification tests.
// SettingsScreen is a thin wrapper around SettingsNavigator from @semblance/ui.
// AI Engine UI lives in SettingsAIEngine.web.tsx (sub-screen of SettingsNavigator).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

describe('Settings AI Engine', () => {
  const settingsScreenSrc = readSrc('packages/desktop/src/screens/SettingsScreen.tsx');
  const navigatorSrc = readSrc('packages/semblance-ui/components/Settings/SettingsNavigator.web.tsx');
  const aiEngineSrc = readSrc('packages/semblance-ui/components/Settings/SettingsAIEngine.web.tsx');
  const rootSrc = readSrc('packages/semblance-ui/components/Settings/SettingsRoot.web.tsx');

  it('SettingsScreen imports and renders SettingsNavigator', () => {
    expect(settingsScreenSrc).toContain("import { SettingsNavigator }");
    expect(settingsScreenSrc).toContain('<SettingsNavigator');
  });

  it('SettingsNavigator routes to SettingsAIEngine sub-screen', () => {
    expect(navigatorSrc).toContain("import { SettingsAIEngine }");
    expect(navigatorSrc).toContain('<SettingsAIEngine');
    expect(navigatorSrc).toContain("case 'ai-engine'");
  });

  it('SettingsAIEngine renders AI engine heading via i18n', () => {
    expect(aiEngineSrc).toContain("t('ai_engine.title')");
  });

  it('SettingsAIEngine shows model name and running status', () => {
    expect(aiEngineSrc).toContain('modelName');
    expect(aiEngineSrc).toContain('isModelRunning');
  });

  it('SettingsAIEngine has inference thread options', () => {
    expect(aiEngineSrc).toContain('threadOptions');
    expect(aiEngineSrc).toContain('inferenceThreads');
  });

  it('SettingsAIEngine has context window options', () => {
    expect(aiEngineSrc).toContain('contextOptions');
    expect(aiEngineSrc).toContain('contextWindow');
  });

  it('SettingsAIEngine has GPU acceleration toggle', () => {
    expect(aiEngineSrc).toContain('gpuAcceleration');
  });

  it('SettingsRoot shows ai-engine row', () => {
    expect(rootSrc).toContain("screen: 'ai-engine'");
    expect(rootSrc).toContain("t('root.rows.ai_engine')");
  });

  it('SettingsScreen passes AI engine props to SettingsNavigator', () => {
    expect(settingsScreenSrc).toContain('modelName=');
    expect(settingsScreenSrc).toContain('hardwareProfile=');
    expect(settingsScreenSrc).toContain('isModelRunning=');
  });

  it('SettingsScreen passes autonomy props', () => {
    expect(settingsScreenSrc).toContain('autonomyTier=');
    expect(settingsScreenSrc).toContain('onChange={handleChange}');
  });
});
