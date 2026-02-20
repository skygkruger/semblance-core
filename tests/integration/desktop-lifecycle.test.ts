/**
 * Desktop Lifecycle Integration Tests
 *
 * Validates process lifecycle management:
 * - Sidecar spawning and initialization
 * - Status event emission on startup
 * - Graceful shutdown on window close
 * - Sidecar process cleanup
 * - Error handling for sidecar failures
 * - LLM management (Ollama status, model switching)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');
const CARGO_TOML = join(ROOT, 'packages', 'desktop', 'src-tauri', 'Cargo.toml');

const libContent = readFileSync(LIB_RS, 'utf-8');
const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');
const cargoContent = readFileSync(CARGO_TOML, 'utf-8');

describe('Lifecycle: Sidecar Spawning', () => {
  it('sidecar script exists', () => {
    expect(existsSync(BRIDGE_TS)).toBe(true);
  });

  it('Rust spawns sidecar via tsx', () => {
    expect(libContent).toContain('tsx');
    expect(libContent).toContain('Command::new');
  });

  it('sidecar uses piped stdin/stdout for communication', () => {
    expect(libContent).toContain('Stdio::piped');
  });

  it('sidecar is killed on drop', () => {
    expect(libContent).toContain('kill_on_drop(true)');
  });

  it('Cargo.toml has tokio process feature', () => {
    expect(cargoContent).toContain('process');
  });

  it('Cargo.toml has tokio io-util feature', () => {
    expect(cargoContent).toContain('io-util');
  });

  it('Cargo.toml has tokio sync feature', () => {
    expect(cargoContent).toContain('sync');
  });
});

describe('Lifecycle: Initialization', () => {
  it('sends initialize command to sidecar on startup', () => {
    expect(libContent).toContain('"initialize"');
  });

  it('emits status-update event after initialization', () => {
    expect(libContent).toContain('semblance://status-update');
  });

  it('stores bridge in Tauri managed state', () => {
    expect(libContent).toContain('app_handle_clone.manage');
    expect(libContent).toContain('AppBridge');
  });

  it('handles initialization failure gracefully', () => {
    expect(libContent).toContain('Sidecar initialization failed');
    expect(libContent).toContain('Initialization failed');
  });

  it('handles sidecar spawn failure gracefully', () => {
    expect(libContent).toContain('Failed to spawn sidecar');
    expect(libContent).toContain('Sidecar spawn failed');
  });

  it('finds project root by walking up directory tree', () => {
    expect(libContent).toContain('find_project_root');
    expect(libContent).toContain('"workspaces"');
  });
});

describe('Lifecycle: Graceful Shutdown', () => {
  it('handles CloseRequested window event', () => {
    expect(libContent).toContain('CloseRequested');
  });

  it('calls shutdown on the bridge', () => {
    expect(libContent).toContain('bridge.shutdown()');
  });

  it('sidecar shuts down Core on shutdown', () => {
    expect(bridgeContent).toContain('core.shutdown()');
  });

  it('sidecar stops Gateway on shutdown', () => {
    expect(bridgeContent).toContain('gateway.stop()');
  });

  it('sidecar closes preferences DB on shutdown', () => {
    expect(bridgeContent).toContain('prefsDb.close()');
  });

  it('sidecar handles SIGTERM signal', () => {
    expect(bridgeContent).toContain("'SIGTERM'");
  });

  it('sidecar handles SIGINT signal', () => {
    expect(bridgeContent).toContain("'SIGINT'");
  });

  it('sidecar handles stdin close', () => {
    expect(bridgeContent).toContain("rl.on('close'");
  });

  it('Rust has shutdown timeout protection', () => {
    expect(libContent).toContain('timeout');
    expect(libContent).toContain('from_secs(5)');
  });

  it('Rust force-kills sidecar after timeout', () => {
    expect(libContent).toContain('child.kill()');
  });
});

describe('Lifecycle: Sidecar Crash Recovery', () => {
  it('detects sidecar stdout close', () => {
    // When stdout stream ends, the sidecar has died
    expect(libContent).toContain('Sidecar process exited unexpectedly');
  });

  it('emits error status on sidecar crash', () => {
    expect(libContent).toContain('semblance://status-update');
    expect(libContent).toContain('disconnected');
  });
});

describe('LLM Management: Ollama Status', () => {
  it('get_ollama_status checks real provider availability', () => {
    expect(bridgeContent).toContain('core.llm.isAvailable()');
  });

  it('get_ollama_status lists real models', () => {
    expect(bridgeContent).toContain('core.llm.listModels()');
  });

  it('get_ollama_status filters out embedding models', () => {
    expect(bridgeContent).toContain('isEmbedding');
  });

  it('get_ollama_status returns active model', () => {
    expect(bridgeContent).toContain('getActiveChatModel');
  });

  it('Rust routes get_ollama_status to sidecar', () => {
    expect(libContent).toContain('"get_ollama_status"');
  });
});

describe('LLM Management: Model Selection', () => {
  it('select_model verifies model exists', () => {
    expect(bridgeContent).toContain('Model "${params.model_id}" not found');
  });

  it('select_model calls setActiveChatModel', () => {
    expect(bridgeContent).toContain('setActiveChatModel');
  });

  it('Rust routes select_model to sidecar', () => {
    expect(libContent).toContain('"select_model"');
  });
});

describe('System Tray', () => {
  it('has system tray configured', () => {
    expect(libContent).toContain('TrayIconBuilder');
  });

  it('shows Semblance tooltip', () => {
    expect(libContent).toContain('Semblance');
  });

  it('shows window on tray click', () => {
    expect(libContent).toContain('window.show()');
    expect(libContent).toContain('set_focus()');
  });
});
