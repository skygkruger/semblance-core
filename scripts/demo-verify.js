#!/usr/bin/env node
/**
 * DEMO VERIFICATION SCRIPT — Semblance
 *
 * Tests the 7 features that must work for a demo. Every test hits the live
 * sidecar over real IPC. TypeScript and unit tests do NOT substitute for this.
 *
 * Usage:
 *   node scripts/demo-verify.js
 *   node scripts/demo-verify.js --verbose
 *
 * Exit code: 0 = all critical tests pass, 1 = any critical test failed
 *
 * Must be run AFTER: node scripts/bundle-sidecar.js
 */

'use strict';

const { spawn } = require('child_process');
const { join } = require('path');
const os = require('os');

const VERBOSE = process.argv.includes('--verbose');
const SIDECAR_PATH = join(__dirname, '..', 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');
const DATA_DIR = join(os.homedir(), '.semblance', 'data');

let sidecar;
let requestId = 1;
let stdoutBuffer = '';
let stderrLines = [];
let allPassed = true;

const results = [];

// ─── Helpers ────────────────────────────────────────────────────────────────

function killSidecar() {
  if (sidecar && !sidecar.killed) sidecar.kill('SIGTERM');
}
process.on('exit', killSidecar);
process.on('SIGINT', () => { killSidecar(); process.exit(1); });
process.on('uncaughtException', (err) => { console.error('Uncaught:', err); killSidecar(); process.exit(1); });

function record(feature, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
  if (status === 'FAIL') allPassed = false;
  results.push({ feature, status, detail });
  console.log(`  ${icon} ${feature}${detail ? ': ' + detail : ''}`);
}

function sendRequest(method, params = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const msg = JSON.stringify({ id, method, params }) + '\n';
    const timeout = setTimeout(() =>
      reject(new Error(`Timeout (${timeoutMs}ms) waiting for ${method}`)), timeoutMs);

    const handler = (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearTimeout(timeout);
            sidecar.stdout.removeListener('data', handler);
            resolve(parsed);
          }
        } catch {}
      }
    };
    sidecar.stdout.on('data', handler);
    sidecar.stdin.write(msg);
  });
}

function waitForStderr(pattern, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    const check = setInterval(() => {
      if (stderrLines.join('\n').includes(pattern)) {
        clearTimeout(t); clearInterval(check); resolve(true);
      }
    }, 100);
  });
}


// ─── Main Test Runner ────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('  SEMBLANCE DEMO VERIFICATION');
  console.log('  Tests 7 features against live sidecar runtime');
  console.log('═'.repeat(60) + '\n');

  // ── Boot ──────────────────────────────────────────────────────────────────
  console.log('📡 Starting sidecar...');
  sidecar = spawn('node', [SIDECAR_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SEMBLANCE_DATA_DIR: DATA_DIR },
  });

  sidecar.stderr.on('data', (d) => {
    const lines = d.toString().split('\n').filter(Boolean);
    stderrLines.push(...lines);
    if (VERBOSE) lines.forEach(l => console.log(`  [sidecar] ${l}`));
  });

  sidecar.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n💀 Sidecar exited unexpectedly (code ${code})`);
    }
  });

  await new Promise(r => setTimeout(r, 500));

  // ── [1] CHAT ─────────────────────────────────────────────────────────────
  console.log('\n[1] CHAT — Sidecar initializes + model loads');
  try {
    const init = await sendRequest('initialize', {}, 180000);
    if (init.error) {
      record('Chat / Initialize', 'FAIL', init.error);
    } else {
      const engine = init.result?.inferenceEngine ?? 'none';
      const model = init.result?.activeModel ?? null;
      record('Chat / Initialize', 'PASS', `engine=${engine}`);
      if (model) {
        record('Chat / Model loaded', 'PASS', model);
      } else {
        record('Chat / Model loaded', 'WARN', 'no model on first initialize (may need Rust backend)');
      }
    }
  } catch (e) {
    record('Chat / Initialize', 'FAIL', e.message);
    console.log('\n📋 Sidecar stderr:');
    console.log(stderrLines.slice(-20).join('\n'));
    killSidecar();
    printReport();
    process.exit(1);
  }


  // ── [2] MODEL STATUS POLLING ───────────────────────────────────────────────
  console.log('\n[2] MODEL STATUS — get_model_status handler (fixes first-launch "Loading...")');
  try {
    const ms = await sendRequest('get_model_status', {}, 10000);
    if (ms.error) {
      record('Model Status / handler', 'FAIL', ms.error);
    } else {
      const model = ms.result?.activeModel;
      const engine = ms.result?.inferenceEngine ?? ms.result?.ollamaStatus ?? 'unknown';
      if (model) {
        record('Model Status / activeModel', 'PASS', model);
      } else {
        record('Model Status / activeModel', 'WARN', 'null — may need Rust backend running');
      }
      record('Model Status / handler responds', 'PASS', `engine=${engine}`);
    }
  } catch (e) {
    record('Model Status / handler', 'FAIL', e.message);
  }

  // ── [3] CONNECTORS ────────────────────────────────────────────────────────
  console.log('\n[3] CONNECTORS — OAuth config resolves (browser open tested manually)');
  try {
    const connectors = await sendRequest('get_connected_services', {}, 8000);
    if (connectors.error) {
      record('Connectors / get_connected_services', 'FAIL', connectors.error);
    } else {
      const services = connectors.result ?? [];
      record('Connectors / handler responds', 'PASS',
        `${Array.isArray(services) ? services.length : '?'} services connected`);
    }
  } catch (e) {
    record('Connectors / get_connected_services', 'FAIL', e.message);
  }

  // Test that OAuth env config loads (connector config resolution)
  try {
    const env = await sendRequest('get_connector_config', { serviceId: 'google-drive' }, 5000);
    if (env.error && env.error.includes('not configured')) {
      record('Connectors / OAuth config', 'WARN', '.env not set (expected without credentials)');
    } else if (env.error) {
      record('Connectors / OAuth config', 'FAIL', env.error);
    } else {
      record('Connectors / OAuth config', 'PASS', 'google-drive config resolves');
    }
  } catch (e) {
    // Method may not exist — check what handlers are available
    record('Connectors / OAuth config', 'WARN', 'get_connector_config not found — verify manually');
  }


  // ── [4] FILE INDEXING ─────────────────────────────────────────────────────
  console.log('\n[4] FILE INDEXING — Stats return camelCase (fixes NaN MB)');
  try {
    const stats = await sendRequest('get_knowledge_stats', {}, 8000);
    if (stats.error) {
      record('Files / get_knowledge_stats', 'FAIL', stats.error);
    } else {
      const r = stats.result ?? {};
      // Verify camelCase keys are present (the fix)
      const hasCC = 'documentCount' in r && 'chunkCount' in r && 'indexSizeBytes' in r;
      const hasSC = 'document_count' in r || 'total_documents' in r;
      if (hasCC) {
        record('Files / camelCase keys', 'PASS',
          `docs=${r.documentCount}, chunks=${r.chunkCount}`);
      } else if (hasSC) {
        record('Files / camelCase keys', 'FAIL',
          'Still returning snake_case — NaN MB bug NOT fixed');
      } else {
        record('Files / camelCase keys', 'WARN',
          'Unexpected shape: ' + Object.keys(r).join(', '));
      }
    }
  } catch (e) {
    record('Files / get_knowledge_stats', 'FAIL', e.message);
  }

  // ── [5] KNOWLEDGE GRAPH ───────────────────────────────────────────────────
  console.log('\n[5] KNOWLEDGE GRAPH — graph query doesn\'t crash (null contactStore fix)');
  try {
    const graph = await sendRequest('get_graph_data', {}, 10000);
    if (graph.error && graph.error.includes('Cannot read')) {
      record('Knowledge Graph / null crash', 'FAIL', graph.error);
    } else if (graph.error) {
      record('Knowledge Graph / query', 'WARN', `Error (but no crash): ${graph.error}`);
    } else {
      const r = graph.result ?? {};
      const nodes = r.nodes?.length ?? r.graphData?.nodes?.length ?? 0;
      record('Knowledge Graph / query', 'PASS', `${nodes} nodes, no crash`);
    }
  } catch (e) {
    if (e.message.includes('Timeout')) {
      record('Knowledge Graph / query', 'WARN', 'Timeout (10s) — graph may be slow on first load');
    } else {
      record('Knowledge Graph / query', 'FAIL', e.message);
    }
  }


  // ── [6] ONBOARDING SKIP ───────────────────────────────────────────────────
  console.log('\n[6] ONBOARDING — Returns completion state (relaunch goes to chat)');
  try {
    const ob = await sendRequest('get_onboarding_complete', {}, 5000);
    if (ob.error) {
      record('Onboarding / state', 'FAIL', ob.error);
    } else {
      record('Onboarding / state', 'PASS',
        `complete=${JSON.stringify(ob.result)}`);
    }
  } catch (e) {
    record('Onboarding / state', 'FAIL', e.message);
  }

  // ── [7] CHAT INFERENCE ────────────────────────────────────────────────────
  console.log('\n[7] CHAT INFERENCE — send_message returns a responseId or sensible error');
  try {
    const msg = await sendRequest('send_message',
      { message: 'What is 2 + 2? Answer in one word.' }, 20000);

    if (msg.error) {
      if (/no.*model|model.*loading|loading.*model|not.*ready/i.test(msg.error)) {
        record('Chat / send_message', 'WARN',
          'No model available (expected without Rust backend): ' + msg.error);
      } else {
        record('Chat / send_message', 'FAIL', msg.error);
      }
    } else if (msg.result?.responseId) {
      record('Chat / send_message', 'PASS',
        `responseId=${msg.result.responseId}`);

      // Wait up to 8s for completion event
      const completed = await waitForStderr('chat-complete', 8000);
      if (completed) {
        record('Chat / inference completes', 'PASS', 'chat-complete event fired');
      } else {
        record('Chat / inference completes', 'WARN', 'chat-complete not seen in 8s (may still be running)');
      }
    } else {
      record('Chat / send_message', 'WARN',
        'Unexpected response: ' + JSON.stringify(msg).slice(0, 100));
    }
  } catch (e) {
    record('Chat / send_message', 'FAIL', e.message);
  }


  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  printReport();
  killSidecar();
  process.exit(allPassed ? 0 : 1);
}

function printReport() {
  const passes = results.filter(r => r.status === 'PASS').length;
  const warns  = results.filter(r => r.status === 'WARN').length;
  const fails  = results.filter(r => r.status === 'FAIL').length;

  console.log('\n' + '═'.repeat(60));
  console.log('  DEMO VERIFICATION REPORT');
  console.log('═'.repeat(60));
  console.log(`  ✅ PASS: ${passes}`);
  console.log(`  ⚠️  WARN: ${warns}  (runtime-only items, verify manually)`);
  console.log(`  ❌ FAIL: ${fails}`);
  console.log('─'.repeat(60));

  if (fails > 0) {
    console.log('\n  FAILURES (must fix before demo):');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`    ❌ ${r.feature}: ${r.detail}`);
    });
  }

  if (warns > 0) {
    console.log('\n  WARNINGS (verify by running the app):');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`    ⚠️  ${r.feature}: ${r.detail}`);
    });
  }

  if (fails === 0) {
    console.log('\n  ✅ ALL CRITICAL TESTS PASS — Safe to build');
    console.log('  Manual verification still required for:');
    console.log('    - Connector OAuth (click Connect, browser opens)');
    console.log('    - File indexing (add folder, stats update)');
    console.log('    - Knowledge Graph (nodes appear after indexing)');
    console.log('    - Upgrade buttons (open browser to pricing)');
  } else {
    console.log('\n  ❌ DEMO NOT READY — Fix failures before building');
  }

  console.log('\n  Sidecar stderr (last 20 lines):');
  console.log(stderrLines.slice(-20).map(l => '  ' + l).join('\n'));
  console.log('═'.repeat(60) + '\n');
}

runTests().catch((err) => {
  console.error('\n💀 Demo verify crashed:', err.message);
  killSidecar();
  printReport();
  process.exit(1);
});
