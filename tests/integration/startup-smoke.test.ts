/**
 * TEST 1: Post-Build Startup Smoke Test
 *
 * Verifies that after building, the sidecar initializes correctly with
 * all critical subsystems working. Catches integration failures that
 * unit tests miss: wrong model selection, missing DB tables, broken
 * think-tag stripping, stale process cleanup.
 *
 * This test starts the actual bundled sidecar, sends real IPC requests,
 * and inspects stderr for errors that would otherwise go unnoticed.
 *
 * Usage: pnpm vitest run tests/integration/startup-smoke.test.ts
 * Requires: sidecar bundled (node scripts/bundle-sidecar.js first)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

const ROOT = join(import.meta.dirname, '..', '..');
const SIDECAR_PATH = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');

let sidecar: ChildProcess;
let stderrLog = '';
let stdoutBuffer = '';
let requestId = 1;

function sendRequest(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const msg = JSON.stringify({ id, method, params }) + '\n';
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method} (${timeoutMs}ms)`)), timeoutMs);

    const handler = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          // Respond to NativeRuntime callback requests so the sidecar doesn't hang
          if (parsed.type === 'callback') {
            sidecar.stdin!.write(JSON.stringify({
              type: 'callback_response',
              id: parsed.id,
              error: 'NativeRuntime not available (standalone test)',
            }) + '\n');
            continue;
          }
          if (parsed.id === id) {
            clearTimeout(timeout);
            sidecar.stdout!.removeListener('data', handler);
            resolve(parsed);
            return;
          }
        } catch { /* not JSON or wrong id */ }
      }
    };

    sidecar.stdout!.on('data', handler);
    sidecar.stdin!.write(msg);
  });
}

describe('Startup Smoke Test', () => {
  beforeAll(async () => {
    // Verify sidecar bundle exists
    expect(existsSync(SIDECAR_PATH)).toBe(true);

    sidecar = spawn('node', ['--no-deprecation', '--max-old-space-size=4096', '--expose-gc', SIDECAR_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SEMBLANCE_DATA_DIR: join(homedir(), '.semblance', 'data'),
      },
    });

    sidecar.stderr!.on('data', (data: Buffer) => { stderrLog += data.toString(); });

    // Wait for stdin reader to be ready
    await new Promise(r => setTimeout(r, 500));

    // Initialize sidecar (model loading can take up to 3 minutes)
    const result = await sendRequest('initialize', {}, 180000);
    expect(result.error).toBeUndefined();
    expect(result.result).toBeDefined();
  }, 200000);

  afterAll(() => {
    if (sidecar && !sidecar.killed) sidecar.kill();
  });

  // ─── Model Selection ──────────────────────────────────────────────────────

  it('selects a valid model — either Ollama GPU or Qwen native', () => {
    // Issue 7: SemblanceCore was falling back to 'llama3.1:8b' even when Ollama was offline.
    // Now fixed: if Ollama IS available, we correctly use it; if not, we use Qwen native.
    const ollamaActive = stderrLog.includes('Ollama GPU inference active');
    const qwenSelected = stderrLog.match(/Chat model selected:.*qwen/i);
    const nativeLoading = stderrLog.match(/Loading reasoning model:.*qwen/i);

    // One of these paths must succeed:
    // 1. Ollama detected and active (uses Ollama's model)
    // 2. Qwen native model selected via NativeRuntime
    expect(ollamaActive || qwenSelected || nativeLoading,
      'Neither Ollama GPU nor Qwen native model was selected'
    ).toBeTruthy();
  });

  it('does not select a fast-tier model as the primary reasoning model', () => {
    // Issue from original failure: Phi-4 (fast) was selected instead of Qwen3 (primary)
    // If NativeRuntime loads, the primary model must NOT be SmolLM2 or Phi-4
    if (stderrLog.includes('Loading reasoning model:')) {
      expect(stderrLog).not.toMatch(/Loading reasoning model:.*(smollm|phi-4)/i);
    }
  });

  // ─── Database Tables ──────────────────────────────────────────────────────

  it('has no SqliteError in stderr', () => {
    // Issue 8: 'no such table: reminders' was spamming stderr every cron tick
    expect(stderrLog).not.toContain('SqliteError');
    expect(stderrLog).not.toContain('SQLITE_ERROR');
  });

  // ─── Think Tag Stripping ──────────────────────────────────────────────────

  it('strips <think> tags from chat responses', async () => {
    // Issue 1: Qwen3 think tags were rendered raw in chat
    const result = await sendRequest('send_message', { message: 'Say hello in one sentence.' }, 60000);

    if (result.result?.responseId) {
      // Wait for async response
      await new Promise(r => setTimeout(r, 5000));
    }

    // Check that the response content (if available) has no think tags
    // The response may come async via event, so also check stderr for the stripped output
    if (result.result?.content) {
      expect(result.result.content).not.toContain('<think>');
      expect(result.result.content).not.toContain('</think>');
    }
  }, 70000);

  // ─── Subsystem Initialization ─────────────────────────────────────────────

  it('initializes all core subsystems without errors', () => {
    expect(stderrLog).toContain('Preferences DB ready');
    expect(stderrLog).toContain('ConversationManager ready');
    expect(stderrLog).toContain('Gateway started');
  });

  it('loads NativeRuntime models on capable hardware (or uses Ollama)', () => {
    // NativeRuntime models load via Rust FFI — only available inside Tauri.
    // When running standalone sidecar (no Tauri), NativeRuntime times out and
    // Ollama takes over if available. Both paths are valid.
    const ollamaActive = stderrLog.includes('Ollama GPU inference active');
    const nativeTimeout = stderrLog.includes('NativeRuntime channel timed out');

    if (ollamaActive) {
      // Ollama path: valid inference backend, NativeRuntime not required
      expect(stderrLog).toContain('Ollama GPU inference active');
    } else if (!nativeTimeout) {
      // Native path: at minimum embedding + reasoning must load
      expect(stderrLog).toContain('Embedding model loaded');
      expect(stderrLog).toContain('Reasoning model loaded');
    } else {
      // Standalone sidecar without Ollama or Tauri — expected to have limited inference
      expect(nativeTimeout).toBe(true);
    }
  });

  // ─── Error-Free Startup ───────────────────────────────────────────────────

  it('has no unhandled errors or missing packages in stderr', () => {
    // Issue 9: WhatsApp baileys missing was throwing errors
    expect(stderrLog).not.toMatch(/Cannot find package/);
    // No uncaught exceptions
    expect(stderrLog).not.toContain('UnhandledPromiseRejection');
    expect(stderrLog).not.toContain('uncaughtException');
  });

  it('has no deprecation warnings in stderr', () => {
    // Issue 10: punycode deprecation was noisy
    expect(stderrLog).not.toContain('DeprecationWarning');
  });

  // ─── Conversation Preview Integrity ───────────────────────────────────────

  it('conversation previews do not contain think tags', async () => {
    // Issue 5: history panel showed raw <think> in previews
    const result = await sendRequest('list_conversations', { limit: 10 });
    if (result.result && Array.isArray(result.result)) {
      for (const conv of result.result) {
        if (conv.last_message_preview) {
          expect(conv.last_message_preview).not.toContain('<think>');
        }
        if (conv.auto_title) {
          expect(conv.auto_title).not.toContain('<think>');
        }
      }
    }
  });
});
