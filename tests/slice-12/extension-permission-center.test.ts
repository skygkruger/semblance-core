import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');
const COMMANDS = readFileSync(join(ROOT, 'packages/desktop/src/ipc/commands.ts'), 'utf-8');
const APP = readFileSync(join(ROOT, 'packages/desktop/src/App.tsx'), 'utf-8');
const SCREEN = readFileSync(join(ROOT, 'packages/desktop/src/screens/CapabilitiesScreen.tsx'), 'utf-8');

describe('Slice 12.3 extension permission center bridge handlers', () => {
  const requiredHandlers = [
    'extension:list_installed',
    'extension:inspect',
    'extension:install',
    'extension:set_permissions',
    'extension:revoke',
    'extension:uninstall',
  ];

  for (const handler of requiredHandlers) {
    it(`registers '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }

  it('initializes extension install store during handleInitialize', () => {
    expect(BRIDGE).toContain('ensureExtensionInstallStore');
    expect(BRIDGE).toContain('loadInstalledExtensionRuntime');
  });
});

describe('Slice 12.3 desktop live path wiring', () => {
  it('CapabilitiesScreen calls extension IPC wrappers', () => {
    expect(SCREEN).toContain('extensionListInstalled');
    expect(SCREEN).toContain('extensionInstall');
    expect(SCREEN).toContain('extensionSetPermissions');
    expect(SCREEN).toContain('extensionRevoke');
    expect(SCREEN).toContain('extensionUninstall');
  });

  it('commands.ts exposes extension IPC wrappers', () => {
    expect(COMMANDS).toContain("'extension:list_installed'");
    expect(COMMANDS).toContain("'extension:install'");
    expect(COMMANDS).toContain("'extension:set_permissions'");
  });

  it('App routes /capabilities to CapabilitiesScreen', () => {
    expect(APP).toContain('/capabilities');
    expect(APP).toContain('CapabilitiesScreen');
    expect(APP).toContain('Execution destinations');
  });
});
