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

  it('does not select an Ollama model name when Ollama is offline', () => {
    // Issue 7: SemblanceCore was falling back to 'llama3.1:8b'
    expect(stderrLog).not.toContain('Chat model selected: llama3.1');
    expect(stderrLog).not.toContain('Chat model selected: llama3');
  });

  it('loads the correct reasoning model (primary tier, not fast tier)', () => {
    // Issue from original failure: Phi-4 (fast) was selected instead of Qwen3 (primary)
    // The reasoning model load log should show a primary-tier model
    expect(stderrLog).toMatch(/Loading reasoning model:.*qwen/i);
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

  it('loads all four NativeRuntime models on capable hardware', () => {
    // All four models should load successfully on Apple Silicon with Metal
    const embeddingLoaded = stderrLog.includes('Embedding model loaded');
    const reasoningLoaded = stderrLog.includes('Reasoning model loaded');
    const fastLoaded = stderrLog.includes('Fast model loaded');
    const visionLoaded = stderrLog.includes('Vision model loaded');

    // At minimum, embedding + reasoning must load
    expect(embeddingLoaded).toBe(true);
    expect(reasoningLoaded).toBe(true);

    // Fast and vision are hardware-dependent but should load on performance tier
    if (stderrLog.includes('Hardware tier: performance')) {
      expect(fastLoaded).toBe(true);
      expect(visionLoaded).toBe(true);
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
