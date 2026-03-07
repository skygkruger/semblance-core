// Settings Web Search — structural verification tests.
// Web search configuration lives in IPC types/commands and sidecar bridge.
// SettingsScreen delegates to SettingsNavigator from @semblance/ui.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

describe('Settings Web Search', () => {
  const ipcTypesSrc = readSrc('packages/desktop/src/ipc/types.ts');
  const ipcCommandsSrc = readSrc('packages/desktop/src/ipc/commands.ts');
  const bridgeSrc = readSrc('packages/desktop/src-tauri/sidecar/bridge.ts');
  const libRsSrc = readSrc('packages/desktop/src-tauri/src/lib.rs');

  it('SearchSettings interface defined in IPC types', () => {
    expect(ipcTypesSrc).toContain('interface SearchSettings');
    expect(ipcTypesSrc).toContain('braveApiKeySet: boolean');
    expect(ipcTypesSrc).toContain('searxngUrl: string | null');
  });

  it('SaveSearchSettingsParams interface defined in IPC types', () => {
    expect(ipcTypesSrc).toContain('interface SaveSearchSettingsParams');
    expect(ipcTypesSrc).toContain('braveApiKey: string | null');
    expect(ipcTypesSrc).toContain('searxngUrl: string | null');
  });

  it('getSearchSettings command exists', () => {
    expect(ipcCommandsSrc).toContain("invoke<SearchSettings>('get_search_settings')");
  });

  it('saveSearchSettings command exists', () => {
    expect(ipcCommandsSrc).toContain("invoke<void>('save_search_settings'");
  });

  it('Rust registers get_search_settings command', () => {
    expect(libRsSrc).toContain('get_search_settings');
  });

  it('Rust registers save_search_settings command', () => {
    expect(libRsSrc).toContain('save_search_settings');
  });

  it('sidecar handles get_search_settings', () => {
    expect(bridgeSrc).toContain("case 'get_search_settings'");
  });

  it('sidecar handles save_search_settings', () => {
    expect(bridgeSrc).toContain("case 'save_search_settings'");
  });

  it('SearchSettings supports Brave and SearXNG providers', () => {
    expect(ipcTypesSrc).toContain('SearchSettings');
    expect(ipcTypesSrc).toContain('braveApiKey');
    expect(ipcTypesSrc).toContain('searxngUrl');
  });

  it('IPC commands import SearchSettings type', () => {
    expect(ipcCommandsSrc).toContain('SearchSettings');
    expect(ipcCommandsSrc).toContain('SaveSearchSettingsParams');
  });

  it('search settings include rate limit', () => {
    expect(ipcTypesSrc).toContain('rateLimit');
  });
});
