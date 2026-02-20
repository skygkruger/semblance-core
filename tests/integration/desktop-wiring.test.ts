/**
 * Desktop Wiring Integration Tests
 *
 * Validates the sidecar bridge architecture:
 * - NDJSON protocol correctness (bridge.ts)
 * - Sidecar imports from @semblance/core and @semblance/gateway
 * - All Tauri commands route through sidecar
 * - Rust backend manages sidecar lifecycle
 * - Event forwarding pattern (sidecar → Rust → frontend)
 *
 * Note: These are static analysis tests. Full end-to-end tests with a running
 * Ollama instance are gated behind SEMBLANCE_TEST_OLLAMA=1.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const LIB_RS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');
const BRIDGE_TS = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');

const libContent = readFileSync(LIB_RS, 'utf-8');
const bridgeContent = readFileSync(BRIDGE_TS, 'utf-8');

describe('Sidecar Bridge: Protocol', () => {
  it('reads NDJSON from stdin', () => {
    expect(bridgeContent).toContain('createInterface');
    expect(bridgeContent).toContain('process.stdin');
  });

  it('writes NDJSON responses to stdout', () => {
    expect(bridgeContent).toContain('process.stdout.write');
    expect(bridgeContent).toContain('JSON.stringify');
  });

  it('has respond function for request-response', () => {
    expect(bridgeContent).toContain('function respond(');
  });

  it('has respondError function for error responses', () => {
    expect(bridgeContent).toContain('function respondError(');
  });

  it('has emit function for event forwarding', () => {
    expect(bridgeContent).toContain('function emit(');
  });

  it('parses request id and method', () => {
    expect(bridgeContent).toContain('req.id');
    expect(bridgeContent).toContain('req.method');
  });
});

describe('Sidecar Bridge: Core Integration', () => {
  it('imports createSemblanceCore from @semblance/core', () => {
    expect(bridgeContent).toContain('createSemblanceCore');
  });

  it('imports scanDirectory and readFileContent for indexing', () => {
    expect(bridgeContent).toContain('scanDirectory');
    expect(bridgeContent).toContain('readFileContent');
  });

  it('imports Gateway from @semblance/gateway', () => {
    expect(bridgeContent).toContain('Gateway');
  });

  it('initializes Gateway before Core', () => {
    // Gateway must start first (IPC server) so Core can connect
    const gatewayStart = bridgeContent.indexOf('gateway.start()');
    const coreInit = bridgeContent.indexOf('core.initialize()');
    expect(gatewayStart).toBeGreaterThan(-1);
    expect(coreInit).toBeGreaterThan(-1);
    expect(gatewayStart).toBeLessThan(coreInit);
  });

  it('checks Ollama availability on initialize', () => {
    expect(bridgeContent).toContain('llm.isAvailable()');
  });

  it('returns Ollama status in initialize response', () => {
    expect(bridgeContent).toContain('ollamaStatus');
    expect(bridgeContent).toContain('activeModel');
    expect(bridgeContent).toContain('availableModels');
  });
});

describe('Sidecar Bridge: Chat Streaming', () => {
  it('uses chatStream for real-time token streaming', () => {
    expect(bridgeContent).toContain('chatStream');
  });

  it('emits chat-token for each streamed token', () => {
    expect(bridgeContent).toContain("emit('chat-token'");
  });

  it('emits chat-complete when streaming finishes', () => {
    expect(bridgeContent).toContain("emit('chat-complete'");
  });

  it('searches knowledge graph before LLM call', () => {
    expect(bridgeContent).toContain('knowledge.search');
  });

  it('builds system prompt with context', () => {
    expect(bridgeContent).toContain('SYSTEM_PROMPT');
  });

  it('stores conversation turns', () => {
    expect(bridgeContent).toContain('storeTurn');
  });

  it('returns response ID immediately for streaming', () => {
    // send_message should respond with the ID before streaming starts
    expect(bridgeContent).toContain('respond(id, responseId)');
  });
});

describe('Sidecar Bridge: Indexing Pipeline', () => {
  it('scans directories for files', () => {
    expect(bridgeContent).toContain('scanDirectory(dir)');
  });

  it('reads file content for each file', () => {
    expect(bridgeContent).toContain('readFileContent(file.path)');
  });

  it('indexes documents individually', () => {
    expect(bridgeContent).toContain('knowledge.indexDocument');
  });

  it('emits indexing-progress for each file', () => {
    expect(bridgeContent).toContain("emit('indexing-progress'");
  });

  it('emits indexing-complete when done', () => {
    expect(bridgeContent).toContain("emit('indexing-complete'");
  });

  it('persists indexed directories to preferences', () => {
    expect(bridgeContent).toContain('indexed_directories');
  });

  it('handles file parsing errors gracefully', () => {
    // Should catch per-file errors and continue
    expect(bridgeContent).toContain('Failed to index');
  });
});

describe('Sidecar Bridge: Preferences', () => {
  it('creates a preferences table', () => {
    expect(bridgeContent).toContain('CREATE TABLE IF NOT EXISTS preferences');
  });

  it('handles set_user_name', () => {
    expect(bridgeContent).toContain("'set_user_name'");
    expect(bridgeContent).toContain("'user_name'");
  });

  it('handles get_user_name', () => {
    expect(bridgeContent).toContain("'get_user_name'");
  });

  it('handles set_onboarding_complete', () => {
    expect(bridgeContent).toContain("'set_onboarding_complete'");
    expect(bridgeContent).toContain("'onboarding_complete'");
  });

  it('handles get_onboarding_complete', () => {
    expect(bridgeContent).toContain("'get_onboarding_complete'");
  });

  it('handles set_autonomy_tier', () => {
    expect(bridgeContent).toContain("'set_autonomy_tier'");
  });

  it('handles get_autonomy_config', () => {
    expect(bridgeContent).toContain("'get_autonomy_config'");
  });
});

describe('Sidecar Bridge: Audit Trail', () => {
  it('queries Gateway audit trail for action log', () => {
    expect(bridgeContent).toContain('getAuditTrail');
  });

  it('maps audit entries to frontend format', () => {
    expect(bridgeContent).toContain('formatAuditDescription');
  });

  it('returns privacy status from Gateway', () => {
    expect(bridgeContent).toContain('all_local');
    expect(bridgeContent).toContain('connection_count');
    expect(bridgeContent).toContain('anomaly_detected');
  });
});

describe('Rust Backend: Sidecar Management', () => {
  it('spawns sidecar process via tsx', () => {
    expect(libContent).toContain('tsx');
    expect(libContent).toContain('bridge.ts');
  });

  it('communicates via stdin/stdout', () => {
    expect(libContent).toContain('Stdio::piped');
    expect(libContent).toContain('stdin');
    expect(libContent).toContain('stdout');
  });

  it('forwards sidecar events as Tauri events', () => {
    expect(libContent).toContain('format!("semblance://{}"');
    expect(libContent).toContain('app_for_stdout.emit');
  });

  it('matches response IDs to pending requests', () => {
    expect(libContent).toContain('pending');
    expect(libContent).toContain('oneshot');
  });

  it('sends initialize command on startup', () => {
    expect(libContent).toContain('"initialize"');
  });

  it('handles sidecar shutdown on window close', () => {
    expect(libContent).toContain('CloseRequested');
    expect(libContent).toContain('shutdown');
  });

  it('kills sidecar on drop', () => {
    expect(libContent).toContain('kill_on_drop(true)');
  });

  it('has request timeout protection', () => {
    expect(libContent).toContain('timeout');
    expect(libContent).toContain('120');
  });
});

describe('Sidecar Bridge: Graceful Shutdown', () => {
  it('handles shutdown method', () => {
    expect(bridgeContent).toContain("case 'shutdown':");
  });

  it('shuts down Core on shutdown', () => {
    expect(bridgeContent).toContain('core.shutdown()');
  });

  it('stops Gateway on shutdown', () => {
    expect(bridgeContent).toContain('gateway.stop()');
  });

  it('handles SIGTERM', () => {
    expect(bridgeContent).toContain('SIGTERM');
  });

  it('handles stdin close', () => {
    expect(bridgeContent).toContain("rl.on('close'");
  });
});
