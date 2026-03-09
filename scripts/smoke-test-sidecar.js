#!/usr/bin/env node
/**
 * Sidecar Integration Smoke Test
 *
 * Sends real JSON-RPC requests to the sidecar and verifies responses.
 * This tests ACTUAL runtime behavior, not just types.
 *
 * Usage: node scripts/smoke-test-sidecar.js
 *
 * Requires: sidecar bundled (node scripts/bundle-sidecar.js first)
 */

const { spawn } = require('child_process');
const { join } = require('path');

const SIDECAR_PATH = join(__dirname, '..', 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');

let passed = 0;
let failed = 0;
let sidecar;
let requestId = 1;
let stderrBuffer = '';
let stdoutBuffer = '';

function log(msg) { console.log(`  ${msg}`); }
function pass(name) { passed++; log(`✅ ${name}`); }
function fail(name, reason) { failed++; log(`❌ ${name}: ${reason}`); }

function sendRequest(method, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const msg = JSON.stringify({ id, method, params }) + '\n';

    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for response to ${method} (${timeoutMs}ms)`)), timeoutMs);

    const handler = (chunk) => {
      stdoutBuffer += chunk.toString();
      // Try to parse complete lines
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || ''; // Keep incomplete last line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearTimeout(timeout);
            sidecar.stdout.removeListener('data', handler);
            resolve(parsed);
            return;
          }
        } catch {}
      }
    };

    sidecar.stdout.on('data', handler);
    sidecar.stdin.write(msg);
  });
}

async function runTests() {
  console.log('\n🔬 SIDECAR INTEGRATION SMOKE TEST\n');

  // Start sidecar
  console.log('Starting sidecar...');
  sidecar = spawn('node', [SIDECAR_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SEMBLANCE_DATA_DIR: join(require('os').homedir(), '.semblance', 'data') },
  });

  sidecar.stderr.on('data', (data) => { stderrBuffer += data.toString(); });

  // Give sidecar a moment to start its stdin reader
  await new Promise(r => setTimeout(r, 500));

  // === TEST: Initialize (send first, this triggers everything) ===
  // The sidecar waits for initialize before doing anything else.
  // Model loading callbacks may timeout (no Rust backend in test mode) — allow 45s.
  try {
    console.log('Sending initialize (may take up to 45s without Rust backend)...');
    const result = await sendRequest('initialize', {}, 45000);
    if (result.error) {
      fail('initialize', result.error);
    } else if (result.result) {
      pass('initialize — sidecar initializes');

      if (result.result.onboardingComplete !== undefined) {
        pass('initialize — returns onboardingComplete');
      } else {
        fail('initialize — missing onboardingComplete in response', JSON.stringify(result.result).slice(0, 100));
      }

      if (result.result.inferenceEngine) {
        pass(`initialize — inference engine: ${result.result.inferenceEngine}`);
      } else {
        log('⚠️  initialize — inference engine: none (expected without Rust backend)');
      }

      if (result.result.activeModel) {
        pass(`initialize — model loaded: ${result.result.activeModel}`);
      } else {
        log('⚠️  initialize — no active model (expected without Rust backend)');
      }
    }
  } catch (e) {
    fail('initialize', e.message);
    // If initialize fails, dump stderr and bail
    console.log('\n📋 Sidecar stderr:');
    console.log(stderrBuffer);
    sidecar.kill();
    process.exit(1);
  }

  // Wait for "Ready" in stderr to confirm full init
  if (stderrBuffer.includes('Ready') || stderrBuffer.includes('ready')) {
    pass('sidecar — reached Ready state');
  } else {
    fail('sidecar — did not reach Ready state', 'missing "Ready" in stderr');
  }

  console.log('');

  // === TEST: Get onboarding status ===
  try {
    const result = await sendRequest('get_onboarding_complete');
    if (result.result !== undefined) {
      pass(`get_onboarding_complete — returns ${JSON.stringify(result.result)}`);
    } else {
      fail('get_onboarding_complete', result.error || 'undefined result');
    }
  } catch (e) {
    fail('get_onboarding_complete', e.message);
  }

  // === TEST: Audit chain status ===
  try {
    const result = await sendRequest('audit_get_chain_status');
    if (result.result && result.result.verified !== undefined) {
      pass(`audit_get_chain_status — verified: ${result.result.verified}, entries: ${result.result.entryCount}`);
    } else {
      fail('audit_get_chain_status', result.error || 'unexpected response');
    }
  } catch (e) {
    fail('audit_get_chain_status', e.message);
  }

  // === TEST: Hardware key backend ===
  try {
    const result = await sendRequest('hw_key_get_backend');
    if (result.result && result.result.backend) {
      pass(`hw_key_get_backend — backend: ${result.result.backend}, hardware: ${result.result.hardwareBacked}`);
    } else if (result.error) {
      log(`⚠️  hw_key_get_backend — ${result.error} (may need TPM/platform support)`);
    }
  } catch (e) {
    fail('hw_key_get_backend', e.message);
  }

  // === TEST: Knowledge stats ===
  try {
    const result = await sendRequest('get_knowledge_stats');
    if (result.result) {
      pass(`get_knowledge_stats — documents: ${result.result.totalDocuments ?? result.result.documentCount ?? 0}`);
    } else {
      fail('get_knowledge_stats', result.error || 'no result');
    }
  } catch (e) {
    fail('get_knowledge_stats', e.message);
  }

  // === TEST: Conversation list ===
  try {
    const result = await sendRequest('list_conversations', { limit: 5 });
    if (result.result) {
      pass(`list_conversations — returned ${Array.isArray(result.result) ? result.result.length : '?'} conversations`);
    } else {
      fail('list_conversations', result.error || 'no result');
    }
  } catch (e) {
    fail('list_conversations', e.message);
  }

  // === TEST: Send message (the critical test) ===
  // Without Rust backend, NativeRuntime is unavailable. Chat should still respond
  // (either with an error about no model, or via Ollama fallback).
  try {
    log('⏳ Testing chat (send_message)...');
    const result = await sendRequest('send_message', { message: 'Hello, what is 2 + 2?' }, 15000);
    if (result.error) {
      // Expected without Rust backend — check if it's a sensible error
      if (result.error.includes('No AI model') || result.error.includes('model') || result.error.includes('loading')) {
        pass(`send_message — correct error without Rust backend: "${result.error}"`);
      } else {
        fail('send_message', result.error);
      }
    } else if (result.result && result.result.responseId) {
      pass(`send_message — got responseId: ${result.result.responseId}`);

      // Wait a moment for the async chat-complete event
      await new Promise(r => setTimeout(r, 3000));

      // Check stderr for chat diagnostics
      if (stderrBuffer.includes('native_generate returned') || stderrBuffer.includes('chat-complete')) {
        pass('send_message — inference completed');
      } else if (stderrBuffer.includes('No AI model available')) {
        pass('send_message — correctly reports no model (expected without Rust backend)');
      } else if (stderrBuffer.includes('native check failed')) {
        log('⚠️  send_message — NativeRuntime callback failed (expected without Rust backend)');
      } else {
        log('⚠️  send_message — response sent but could not verify completion in 3s');
      }
    } else {
      fail('send_message', 'unexpected response: ' + JSON.stringify(result).slice(0, 200));
    }
  } catch (e) {
    fail('send_message', e.message);
  }

  // === REPORT ===
  console.log('\n' + '='.repeat(50));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    console.log('\n📋 Sidecar stderr (last 30 lines):');
    console.log(stderrBuffer.split('\n').slice(-30).join('\n'));
  }

  // Cleanup
  sidecar.kill();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('\n💀 SMOKE TEST CRASHED:', err.message);
  if (sidecar) sidecar.kill();
  process.exit(1);
});
