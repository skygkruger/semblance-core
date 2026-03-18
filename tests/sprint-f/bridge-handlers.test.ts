import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const BRIDGE = readFileSync(join(ROOT, 'packages/desktop/src-tauri/sidecar/bridge.ts'), 'utf-8');

describe('Sprint F — Bridge Handler Registration', () => {
  // 4 binary allowlist handlers
  const allowlistHandlers = [
    'binary_allowlist_list',
    'binary_allowlist_add',
    'binary_allowlist_remove',
    'binary_allowlist_check',
  ];

  // 13 system action type handlers
  const systemHandlers = [
    'system_execute',
    'system_hardware_stat',
    'system_app_launch',
    'system_app_list',
    'system_file_watch',
    'system_file_watch_stop',
    'system_clipboard_read',
    'system_clipboard_write',
    'system_notification',
    'system_accessibility_read',
    'system_keypress',
    'system_shortcut_run',
    'system_process_kill',
    'system_process_list',
  ];

  for (const handler of [...allowlistHandlers, ...systemHandlers]) {
    it(`has handler for '${handler}'`, () => {
      expect(BRIDGE).toContain(`case '${handler}':`);
    });
  }

  it('has all 18 Sprint F handlers (4 allowlist + 14 system)', () => {
    const allHandlers = [...allowlistHandlers, ...systemHandlers];
    for (const handler of allHandlers) {
      expect(BRIDGE).toContain(`case '${handler}':`);
    }
    expect(allHandlers.length).toBe(18);
  });
});

describe('Sprint F — Sprint F Imports', () => {
  it('imports BinaryAllowlist', () => {
    expect(BRIDGE).toContain("import { BinaryAllowlist }");
  });

  it('imports ArgumentValidator', () => {
    expect(BRIDGE).toContain("import { ArgumentValidator }");
  });

  it('imports SystemCommandGateway', () => {
    expect(BRIDGE).toContain("import { SystemCommandGateway }");
  });
});

describe('Sprint F — Initialization', () => {
  it('creates BinaryAllowlist in handleInitialize', () => {
    expect(BRIDGE).toContain('new BinaryAllowlist(');
    expect(BRIDGE).toContain('Hardware Bridge initialized');
  });

  it('creates ArgumentValidator', () => {
    expect(BRIDGE).toContain('new ArgumentValidator()');
  });

  it('creates SystemCommandGateway with allowlist and validator', () => {
    expect(BRIDGE).toContain('new SystemCommandGateway(binaryAllowlist, argumentValidator)');
  });
});

describe('Sprint F — Security Enforcement', () => {
  it('system_execute uses SystemCommandGateway.execute()', () => {
    expect(BRIDGE).toContain('systemCommandGateway.execute(');
  });

  it('system_process_kill checks session-owned PID table', () => {
    expect(BRIDGE).toContain('systemCommandGateway.killProcess(');
  });

  it('accessibility_read redacts password fields', () => {
    expect(BRIDGE).toContain('AXSecureTextField');
    expect(BRIDGE).toContain('REDACTED');
    expect(BRIDGE).toContain('password');
  });
});

describe('Sprint F — Rust Hardware Stats', () => {
  it('get_live_hardware_stats registered as Tauri command', () => {
    const libRs = readFileSync(join(ROOT, 'packages/desktop/src-tauri/src/lib.rs'), 'utf-8');
    expect(libRs).toContain('get_live_hardware_stats');
    expect(libRs).toContain('async fn get_live_hardware_stats');
  });

  it('hardware.rs has get_live_stats() function', () => {
    const hwRs = readFileSync(join(ROOT, 'packages/desktop/src-tauri/src/hardware.rs'), 'utf-8');
    expect(hwRs).toContain('pub fn get_live_stats()');
    expect(hwRs).toContain('LiveHardwareStats');
    expect(hwRs).toContain('DiskStat');
    expect(hwRs).toContain('cpu_usage_percent');
    expect(hwRs).toContain('memory_available_mb');
    expect(hwRs).toContain('cpu_temp_celsius');
    expect(hwRs).toContain('gpu_temp_celsius');
  });

  it('LiveHardwareStats uses sysinfo crate directly (no shell)', () => {
    const hwRs = readFileSync(join(ROOT, 'packages/desktop/src-tauri/src/hardware.rs'), 'utf-8');
    expect(hwRs).toContain('sysinfo');
    expect(hwRs).toContain('System::new_all()');
    expect(hwRs).toContain('Disks::new_with_refreshed_list()');
    expect(hwRs).toContain('Components::new_with_refreshed_list()');
    // Should NOT shell out for stats
    expect(hwRs).not.toContain('wmic logicaldisk');
    expect(hwRs).not.toContain('system_profiler');
  });
});

describe('Sprint F — Action Type Registration', () => {
  it('all system.* action types in IPC types', () => {
    const ipcSrc = readFileSync(join(ROOT, 'packages/core/types/ipc.ts'), 'utf-8');
    const systemActions = [
      'system.execute', 'system.hardware_stat', 'system.app_launch', 'system.app_list',
      'system.file_watch', 'system.file_watch_stop', 'system.clipboard_read', 'system.clipboard_write',
      'system.notification', 'system.accessibility_read', 'system.keypress', 'system.shortcut_run',
      'system.process_kill', 'system.process_signal', 'system.process_list',
    ];
    for (const action of systemActions) {
      expect(ipcSrc).toContain(`'${action}'`);
    }
  });

  it('all system.* action types in autonomy maps', () => {
    const autonomySrc = readFileSync(join(ROOT, 'packages/core/agent/autonomy.ts'), 'utf-8');
    expect(autonomySrc).toContain("'system.execute': 'system'");
    expect(autonomySrc).toContain("'system.execute': 'execute'");
    expect(autonomySrc).toContain("'system.hardware_stat': 'read'");
    expect(autonomySrc).toContain("'system.keypress': 'execute'");
    expect(autonomySrc).toContain("'system.clipboard_read': 'read'");
  });
});
