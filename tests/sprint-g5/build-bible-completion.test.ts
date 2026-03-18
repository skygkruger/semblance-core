import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

describe('Sprint G.5 — Phase 1: Security Fix', () => {
  it('file-scanner.ts calls sanitizeRetrievedContent', () => {
    const src = readFileSync(join(ROOT, 'packages/core/knowledge/file-scanner.ts'), 'utf-8');
    expect(src).toContain('sanitizeRetrievedContent');
    expect(src).toContain("import { sanitizeRetrievedContent }");
  });
});

describe('Sprint G.5 — Phase 2: Browser CDP', () => {
  it('browser-cdp-adapter.ts exists without exec or shell invocation', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/browser/browser-cdp-adapter.ts'), 'utf-8');
    expect(src).toContain('BrowserCDPAdapter');
    expect(src).toContain('connect');
    expect(src).toContain('navigate');
    expect(src).toContain('snapshot');
    expect(src).toContain('click');
    expect(src).toContain('fill');
    expect(src).toContain('screenshot');
    // No child_process exec or spawn imports
    expect(src).not.toContain("import { exec");
    expect(src).not.toContain("child_process");
    expect(src).toContain('allowlist');
  });

  const browserHandlers = [
    'browser_connect', 'browser_disconnect', 'browser_navigate',
    'browser_snapshot', 'browser_click', 'browser_type',
    'browser_extract', 'browser_fill', 'browser_screenshot',
  ];

  for (const h of browserHandlers) {
    it(`bridge handler '${h}' exists`, () => {
      expect(BRIDGE).toContain(`case '${h}':`);
    });
  }

  it('browser.* action types in IPC registry', () => {
    const ipc = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
    expect(ipc).toContain("'browser.navigate'");
    expect(ipc).toContain("'browser.fill'");
    expect(ipc).toContain("'browser.screenshot'");
  });

  it('browser.fill has execute risk level', () => {
    const autonomy = readFileSync(join(ROOT, 'packages/core/agent/autonomy.ts'), 'utf-8');
    expect(autonomy).toContain("'browser.fill': 'execute'");
  });
});

describe('Sprint G.5 — Phase 3: Alter Ego Week', () => {
  it('alter-ego-week-engine.ts exists with SQLite schema', () => {
    const src = readFileSync(join(ROOT, 'packages/core/agent/alter-ego-week-engine.ts'), 'utf-8');
    expect(src).toContain('AlterEgoWeekEngine');
    expect(src).toContain('alter_ego_week');
    expect(src).toContain('runDayDemo');
    expect(src).toContain('acceptActivation');
    expect(src).toContain('current_day INTEGER');
    expect(src).toContain('activation_offered');
  });

  const aeHandlers = [
    'alter_ego_week_get_state', 'alter_ego_week_start',
    'alter_ego_week_run_day', 'alter_ego_week_advance',
    'alter_ego_week_skip', 'alter_ego_week_accept',
  ];

  for (const h of aeHandlers) {
    it(`bridge handler '${h}' exists`, () => {
      expect(BRIDGE).toContain(`case '${h}':`);
    });
  }
});

describe('Sprint G.5 — Phase 4: Import + Mesh', () => {
  it('import-everything-orchestrator.ts exists', () => {
    const src = readFileSync(join(ROOT, 'packages/core/agent/import-everything-orchestrator.ts'), 'utf-8');
    expect(src).toContain('ImportEverythingOrchestrator');
    expect(src).toContain('detectSources');
    expect(src).toContain('importSource');
    expect(src).toContain('browser_history');
    expect(src).toContain('consent');
  });

  const importHandlers = ['import_detect_sources', 'import_run_source', 'import_get_history'];
  for (const h of importHandlers) {
    it(`bridge handler '${h}' exists`, () => {
      expect(BRIDGE).toContain(`case '${h}':`);
    });
  }

  it('PeerCapabilityManifest in tunnel-gateway-server.ts', () => {
    const src = readFileSync(join(ROOT, 'packages/gateway/tunnel/tunnel-gateway-server.ts'), 'utf-8');
    expect(src).toContain('PeerCapabilityManifest');
    expect(src).toContain('knowledgeGraphStats');
    expect(src).toContain('enabledFeatures');
    expect(src).toContain('availableRamMb');
  });

  it('search.federated action type in IPC registry', () => {
    const ipc = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
    expect(ipc).toContain("'search.federated'");
  });

  it('executedOn field in ActionResponse', () => {
    const ipc = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
    expect(ipc).toContain("executedOn:");
    expect(ipc).toContain("remoteDeviceId:");
    expect(ipc).toContain("remoteDeviceName:");
  });

  it('tunnel_peer_manifest and search_federated handlers exist', () => {
    expect(BRIDGE).toContain("case 'tunnel_peer_manifest':");
    expect(BRIDGE).toContain("case 'search_federated':");
  });
});
