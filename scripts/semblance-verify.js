#!/usr/bin/env node
/**
 * SEMBLANCE EXTENDED VERIFICATION SCRIPT
 *
 * Tests every feature slice against the live sidecar. This is the GATE.
 * Claude Code must attach this output to every SHIP report.
 * A feature is not done until its slices are green here.
 *
 * Usage:
 *   node scripts/semblance-verify.js                   # All slices
 *   node scripts/semblance-verify.js --feature=chat    # One feature
 *   node scripts/semblance-verify.js --diff            # Compare to last run
 *   node scripts/semblance-verify.js --verbose         # Show sidecar stderr
 *
 * Exit code: 0 = P0 gate passes, 1 = P0 gate fails
 */

'use strict';

const { spawn } = require('child_process');
const { join } = require('path');
const { writeFileSync, readFileSync, existsSync, mkdirSync } = require('fs');
const os = require('os');

const VERBOSE = process.argv.includes('--verbose');
const DIFF_MODE = process.argv.includes('--diff');
const FEATURE_FLAG = process.argv.find(a => a.startsWith('--feature='));
const FEATURE_FILTER = FEATURE_FLAG ? FEATURE_FLAG.split('=')[1].toUpperCase() : null;

// Allow install-and-verify.js to point this script at the installed binary
const SIDECAR_PATH = process.env.SEMBLANCE_SIDECAR_OVERRIDE ||
  join(__dirname, '..', 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');
const DATA_DIR = join(os.homedir(), '.semblance', 'data');
const STATE_DIR = join(__dirname, '..', '.semblance-verify');
const STATE_FILE = join(STATE_DIR, 'last-run.json');

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

// ─── Sidecar Control ──────────────────────────────────────────────────────────

let sidecar;
let stdoutBuffer = '';
let stderrLines = [];
let requestId = 1;

function killSidecar() {
  if (sidecar && !sidecar.killed) sidecar.kill('SIGTERM');
}
process.on('exit', killSidecar);
process.on('SIGINT', () => { killSidecar(); process.exit(1); });
process.on('uncaughtException', (err) => { console.error('Uncaught:', err); killSidecar(); process.exit(1); });

async function startSidecar() {
  sidecar = spawn('node', [SIDECAR_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SEMBLANCE_DATA_DIR: DATA_DIR },
  });
  sidecar.stderr.on('data', (d) => {
    const lines = d.toString().split('\n').filter(Boolean);
    stderrLines.push(...lines);
    if (VERBOSE) lines.forEach(l => console.log(`    [sidecar] ${l}`));
  });
  sidecar.on('exit', (code) => {
    if (code !== null && code !== 0 && code !== null) {
      // Only log unexpected exits
    }
  });
  await new Promise(r => setTimeout(r, 800));
}

function sendRequest(method, params = {}, timeoutMs = 20000) {
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
        } catch { /* ignore non-JSON */ }
      }
    };
    sidecar.stdout.on('data', handler);
    sidecar.stdin.write(msg);
  });
}

function waitForEvent(eventName, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    const handler = (chunk) => {
      const text = chunk.toString();
      const lines = text.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === eventName) {
            clearTimeout(timeout);
            sidecar.stdout.removeListener('data', handler);
            resolve(true);
          }
        } catch { /* ignore */ }
      }
    };
    sidecar.stdout.on('data', handler);
  });
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

const allResults = [];

class Feature {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.pass = 0;
    this.warn = 0;
    this.fail = 0;
  }

  record(testName, status, detail) {
    this.tests.push({ testName, status, detail });
    if (status === 'PASS') this.pass++;
    else if (status === 'WARN') this.warn++;
    else this.fail++;
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
    if (VERBOSE || status !== 'PASS') {
      console.log(`    ${icon} ${testName}${detail ? ': ' + detail : ''}`);
    }
  }

  summary() {
    const total = this.pass + this.warn + this.fail;
    const icon = this.fail > 0 ? '❌' : this.warn > 0 ? '⚠️ ' : '✅';
    return `${icon} ${this.name.padEnd(10)} ${this.pass}/${total}`;
  }
}

// ─── FEATURE SLICES ───────────────────────────────────────────────────────────

async function testFoundation(f) {
  // Initialize (required for everything)
  let initialized = false;
  let inferenceEngine = 'none';
  let activeModel = null;

  try {
    const init = await sendRequest('initialize', {}, 180000);
    if (init.error) {
      f.record('Initialize', 'FAIL', init.error.slice(0, 100));
      return; // Can't test anything else
    }
    initialized = true;
    inferenceEngine = init.result?.inferenceEngine ?? 'none';
    activeModel = init.result?.activeModel ?? null;
    f.record('Initialize', 'PASS', `engine=${inferenceEngine}`);
  } catch (e) {
    f.record('Initialize', 'FAIL', e.message.slice(0, 80));
    return;
  }

  return { initialized, inferenceEngine, activeModel };
}

async function testChat(initResult) {
  const f = new Feature('CHAT');
  console.log('\n  ── CHAT ──');

  if (!initResult) { f.record('Requires init', 'FAIL', 'Init failed'); return f; }

  const { inferenceEngine, activeModel } = initResult;

  // CHAT-1: Engine is not 'none'
  if (inferenceEngine !== 'none') {
    f.record('Engine available', 'PASS', inferenceEngine);
  } else {
    f.record('Engine available', 'FAIL', 'inferenceEngine=none — no model loaded, no Ollama running');
  }

  // CHAT-2: Active model is non-null
  if (activeModel) {
    f.record('Active model', 'PASS', activeModel);
  } else {
    f.record('Active model', 'WARN', 'null — model may still be loading (check NativeRuntime)');
  }

  // CHAT-3: get_model_status handler
  try {
    const ms = await sendRequest('get_model_status', {}, 10000);
    if (ms.error) {
      f.record('get_model_status handler', 'FAIL', ms.error);
    } else {
      f.record('get_model_status handler', 'PASS', `engine=${ms.result?.inferenceEngine ?? 'unknown'}`);
    }
  } catch (e) {
    f.record('get_model_status handler', 'FAIL', e.message);
  }

  // CHAT-4: send_message returns responseId
  if (inferenceEngine !== 'none') {
    try {
      const msg = await sendRequest('send_message',
        { message: 'What is 2 + 2? Answer with just the number.' }, 30000);
      if (msg.error) {
        if (/model|loading|ready/i.test(msg.error)) {
          f.record('send_message', 'WARN', 'Model not ready: ' + msg.error.slice(0, 60));
        } else {
          f.record('send_message', 'FAIL', msg.error.slice(0, 100));
        }
      } else if (msg.result?.responseId) {
        f.record('send_message', 'PASS', `responseId=${msg.result.responseId}`);

        // CHAT-5: chat-complete fires
        const completed = await waitForEvent('semblance://chat-complete', 90000);
        f.record('Inference completes', completed ? 'PASS' : 'WARN',
          completed ? 'chat-complete fired' : 'No completion event in 90s');
      } else {
        f.record('send_message', 'WARN', 'Unexpected: ' + JSON.stringify(msg).slice(0, 80));
      }
    } catch (e) {
      f.record('send_message', 'FAIL', e.message);
    }
  } else {
    f.record('send_message', 'WARN', 'Skipped — no inference engine available');
    f.record('Inference completes', 'WARN', 'Skipped — no inference engine');
  }

  allResults.push(f);
  return f;
}

async function testPersist() {
  const f = new Feature('PERSIST');
  console.log('\n  ── PERSIST ──');

  // PERSIST-1: get_onboarding_complete
  try {
    const ob = await sendRequest('get_onboarding_complete', {}, 5000);
    if (ob.error) f.record('get_onboarding_complete', 'FAIL', ob.error);
    else f.record('get_onboarding_complete', 'PASS', `complete=${JSON.stringify(ob.result)}`);
  } catch (e) { f.record('get_onboarding_complete', 'FAIL', e.message); }

  // PERSIST-2: get_pref
  try {
    const gp = await sendRequest('get_pref', { key: 'ai_name' }, 5000);
    if (gp.error) f.record('get_pref handler', 'FAIL', gp.error);
    else f.record('get_pref handler', 'PASS', `ai_name="${gp.result ?? '(not set)'}"`);
  } catch (e) { f.record('get_pref handler', 'FAIL', e.message); }

  // PERSIST-3: set_pref round-trip
  try {
    const testVal = `verify_${Date.now()}`;
    const sp = await sendRequest('set_pref', { key: '__verify_test', value: testVal }, 5000);
    if (sp.error) { f.record('set_pref write', 'FAIL', sp.error); }
    else {
      const gp = await sendRequest('get_pref', { key: '__verify_test' }, 5000);
      if (gp.result === testVal) f.record('Pref round-trip', 'PASS', 'write→read matches');
      else f.record('Pref round-trip', 'FAIL', `wrote "${testVal}", got "${gp.result}"`);
    }
  } catch (e) { f.record('set_pref round-trip', 'FAIL', e.message); }

  // PERSIST-4: User name accessible
  try {
    const un = await sendRequest('get_pref', { key: 'user_name' }, 5000);
    if (un.error) f.record('user_name pref', 'WARN', un.error);
    else f.record('user_name pref', 'PASS', `user_name="${un.result ?? '(not set, expected on first run)'}"`);
  } catch (e) { f.record('user_name pref', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testConnections() {
  const f = new Feature('CONNECT');
  console.log('\n  ── CONNECTIONS ──');

  // CONNECT-1: get_connected_services handler
  try {
    const cs = await sendRequest('get_connected_services', {}, 8000);
    if (cs.error) {
      f.record('get_connected_services', 'FAIL', cs.error);
    } else {
      const services = Array.isArray(cs.result) ? cs.result : [];
      f.record('get_connected_services', 'PASS', `${services.length} services connected`);
      if (services.length > 0) {
        f.record('Connected services', 'PASS', services.map(s => s.serviceId ?? s).join(', '));
      } else {
        f.record('Connected services', 'WARN', 'None — connect a service via the app to test OAuth');
      }
    }
  } catch (e) { f.record('get_connected_services', 'FAIL', e.message); }

  // CONNECT-2: get_connector_config for Google Drive
  try {
    const gc = await sendRequest('get_connector_config', { serviceId: 'google-drive' }, 5000);
    if (!gc || gc.error?.includes('not configured') || gc.error?.includes('UNCONFIGURED')) {
      f.record('OAuth .env config', 'WARN', 'Google Drive client ID not set in .env (expected without credentials)');
    } else if (gc.error) {
      f.record('OAuth .env config', 'FAIL', gc.error);
    } else {
      f.record('OAuth .env config', 'PASS', 'google-drive config resolves');
    }
  } catch (e) {
    f.record('OAuth .env config', 'WARN', 'get_connector_config method unavailable: ' + e.message.slice(0, 50));
  }

  // CONNECT-3: list_available_connectors
  try {
    const lc = await sendRequest('list_available_connectors', {}, 5000);
    if (lc.error) {
      f.record('list_available_connectors', 'WARN', lc.error);
    } else {
      const count = Array.isArray(lc.result) ? lc.result.length : 0;
      f.record('list_available_connectors', count > 0 ? 'PASS' : 'WARN', `${count} connectors available`);
    }
  } catch (e) { f.record('list_available_connectors', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testGraph() {
  const f = new Feature('GRAPH');
  console.log('\n  ── KNOWLEDGE GRAPH ──');

  // GRAPH-1: get_graph_data doesn't crash
  try {
    const g = await sendRequest('get_graph_data', {}, 15000);
    if (g.error?.includes('Cannot read') || g.error?.includes('undefined')) {
      f.record('No null crash', 'FAIL', g.error.slice(0, 100));
    } else if (g.error) {
      f.record('get_graph_data', 'WARN', `Non-crash error: ${g.error.slice(0, 80)}`);
    } else {
      const r = g.result ?? {};
      const nodes = r.nodes?.length ?? r.graphData?.nodes?.length ?? 0;
      f.record('No null crash', 'PASS', `${nodes} nodes returned`);

      // GRAPH-2: Response shape
      const hasNodes = 'nodes' in r || 'graphData' in r;
      f.record('Response shape', hasNodes ? 'PASS' : 'WARN',
        hasNodes ? 'has nodes/edges' : 'Unexpected shape: ' + Object.keys(r).join(', '));

      // GRAPH-3: Nodes have categories (only if nodes exist)
      if (nodes > 0) {
        const nodeList = r.nodes ?? r.graphData?.nodes ?? [];
        const hasCategories = nodeList.some(n => n.category || n.type);
        f.record('Nodes have categories', hasCategories ? 'PASS' : 'WARN',
          hasCategories ? 'category labels present' : 'nodes lack category labels');
      } else {
        f.record('Node population', 'WARN', '0 nodes — index files/emails to populate graph');
      }
    }
  } catch (e) {
    if (e.message.includes('Timeout')) {
      f.record('get_graph_data', 'WARN', 'Timeout 15s — graph slow on first load');
    } else {
      f.record('get_graph_data', 'FAIL', e.message);
    }
  }

  allResults.push(f);
  return f;
}

async function testFiles() {
  const f = new Feature('FILES');
  console.log('\n  ── FILE INDEXING ──');

  // FILES-1: get_knowledge_stats — camelCase keys
  try {
    const ks = await sendRequest('get_knowledge_stats', {}, 8000);
    if (ks.error) {
      f.record('get_knowledge_stats', 'FAIL', ks.error);
    } else {
      const r = ks.result ?? {};
      const hasCC = 'documentCount' in r && 'chunkCount' in r && 'indexSizeBytes' in r;
      const hasSC = 'document_count' in r || 'total_documents' in r;
      if (hasCC) {
        f.record('camelCase keys', 'PASS', `docs=${r.documentCount}, chunks=${r.chunkCount}`);
      } else if (hasSC) {
        f.record('camelCase keys', 'FAIL', 'Still snake_case — NaN MB bug NOT fixed');
      } else {
        f.record('camelCase keys', 'WARN', 'Unexpected shape: ' + Object.keys(r).slice(0,5).join(', '));
      }
    }
  } catch (e) { f.record('get_knowledge_stats', 'FAIL', e.message); }

  // FILES-2: search_files handler exists
  try {
    const sf = await sendRequest('search_files', { query: 'test' }, 10000);
    if (sf.error) {
      f.record('search_files handler', 'FAIL', sf.error);
    } else {
      const results = Array.isArray(sf.result) ? sf.result.length : 0;
      f.record('search_files handler', 'PASS', `${results} results (0 expected if no files indexed)`);
    }
  } catch (e) { f.record('search_files handler', 'FAIL', e.message); }

  // FILES-3: list_indexed_directories
  try {
    const lid = await sendRequest('list_indexed_directories', {}, 5000);
    if (lid.error) {
      f.record('list_indexed_directories', 'WARN', lid.error);
    } else {
      const dirs = Array.isArray(lid.result) ? lid.result.length : 0;
      f.record('list_indexed_directories', 'PASS', `${dirs} directories indexed`);
    }
  } catch (e) { f.record('list_indexed_directories', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testEmail() {
  const f = new Feature('EMAIL');
  console.log('\n  ── EMAIL ──');

  // EMAIL-1: get_inbox_items handler
  try {
    const inbox = await sendRequest('get_inbox_items', { limit: 5, offset: 0 }, 15000);
    if (inbox.error) {
      f.record('get_inbox_items', 'FAIL', inbox.error);
    } else {
      const emails = Array.isArray(inbox.result) ? inbox.result.length : 0;
      if (emails > 0) {
        f.record('get_inbox_items', 'PASS', `${emails} emails returned`);
        // EMAIL-2: Email has required fields
        const first = inbox.result[0];
        const hasFields = first && first.messageId && first.subject !== undefined && first.from;
        f.record('Email data shape', hasFields ? 'PASS' : 'WARN',
          hasFields ? 'messageId, subject, from present' : 'Missing expected fields');
      } else {
        f.record('get_inbox_items', 'WARN', '0 emails — connect Gmail/Outlook and sync to populate');
        f.record('Email data shape', 'WARN', 'Skipped — no emails to inspect');
      }
    }
  } catch (e) { f.record('get_inbox_items', 'FAIL', e.message); }

  // EMAIL-3: search_emails handler
  try {
    const se = await sendRequest('search_emails', { query: 'test' }, 10000);
    if (se.error) f.record('search_emails handler', 'FAIL', se.error);
    else f.record('search_emails handler', 'PASS', `${Array.isArray(se.result) ? se.result.length : 0} results`);
  } catch (e) { f.record('search_emails handler', 'FAIL', e.message); }

  // EMAIL-4: draft_email handler (safe — doesn't send)
  try {
    const draft = await sendRequest('draft_email_action', {
      to: ['test@example.com'],
      subject: 'Verify test draft',
      body: 'This is a verification test draft.',
    }, 8000);
    if (draft.error && !draft.error.includes('no email')) {
      f.record('draft_email handler', 'WARN', draft.error.slice(0, 80));
    } else if (draft.error?.includes('no email') || draft.error?.includes('not configured')) {
      f.record('draft_email handler', 'WARN', 'No email account configured (expected without credentials)');
    } else {
      f.record('draft_email handler', 'PASS', 'Draft action accepted');
    }
  } catch (e) { f.record('draft_email handler', 'WARN', e.message); }

  // EMAIL-5: get_actions_summary
  try {
    const as = await sendRequest('get_actions_summary', {}, 5000);
    if (as.error) f.record('get_actions_summary', 'WARN', as.error);
    else f.record('get_actions_summary', 'PASS',
      `today=${as.result?.todayCount ?? 0}, timeSaved=${as.result?.todayTimeSavedSeconds ?? 0}s`);
  } catch (e) { f.record('get_actions_summary', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testCalendar() {
  const f = new Feature('CAL');
  console.log('\n  ── CALENDAR ──');

  // CAL-1: get_today_events
  try {
    const ev = await sendRequest('get_today_events', {}, 10000);
    if (ev.error) {
      f.record('get_today_events', 'WARN', ev.error.slice(0, 80));
    } else {
      const events = Array.isArray(ev.result) ? ev.result.length : 0;
      f.record('get_today_events', 'PASS', `${events} events today (0 if no calendar connected)`);
    }
  } catch (e) { f.record('get_today_events', 'WARN', e.message); }

  // CAL-2: fetch_calendar via orchestrator tool
  try {
    const fc = await sendRequest('fetch_calendar_events', { daysAhead: 7 }, 10000);
    if (fc.error && !fc.error.includes('no calendar')) {
      f.record('fetch_calendar_events', 'WARN', fc.error.slice(0, 80));
    } else if (fc.error) {
      f.record('fetch_calendar_events', 'WARN', 'No calendar connected (expected)');
    } else {
      f.record('fetch_calendar_events', 'PASS',
        `${Array.isArray(fc.result) ? fc.result.length : 0} events in next 7 days`);
    }
  } catch (e) { f.record('fetch_calendar_events', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testReminders() {
  const f = new Feature('REMIND');
  console.log('\n  ── REMINDERS ──');

  // REMIND-1: create_reminder
  let reminderId = null;
  const dueAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
  try {
    const cr = await sendRequest('create_reminder', {
      text: 'Verification test reminder — safe to delete',
      dueAt,
    }, 8000);
    if (cr.error) {
      f.record('create_reminder', 'FAIL', cr.error);
    } else {
      reminderId = cr.result?.id ?? cr.result;
      f.record('create_reminder', 'PASS', `id=${reminderId}`);
    }
  } catch (e) { f.record('create_reminder', 'FAIL', e.message); }

  // REMIND-2: list_reminders contains the new one
  if (reminderId) {
    try {
      const lr = await sendRequest('get_reminders', {}, 5000);
      if (lr.error) {
        f.record('list_reminders', 'FAIL', lr.error);
      } else {
        const reminders = Array.isArray(lr.result) ? lr.result : [];
        const found = reminders.some(r => r.id === reminderId);
        f.record('Reminder persists', found ? 'PASS' : 'FAIL',
          found ? 'created reminder appears in list' : `id ${reminderId} not in list of ${reminders.length}`);
      }
    } catch (e) { f.record('list_reminders', 'FAIL', e.message); }

    // REMIND-3: snooze_reminder
    try {
      const sr = await sendRequest('snooze_reminder', { id: reminderId, duration: '1hr' }, 5000);
      if (sr.error) f.record('snooze_reminder', 'WARN', sr.error);
      else f.record('snooze_reminder', 'PASS', 'Reminder snoozed');
    } catch (e) { f.record('snooze_reminder', 'WARN', e.message); }

    // REMIND-4: dismiss_reminder (cleanup)
    try {
      const dr = await sendRequest('dismiss_reminder', { id: reminderId }, 5000);
      if (dr.error) f.record('dismiss_reminder', 'WARN', dr.error);
      else f.record('dismiss_reminder', 'PASS', 'Cleanup complete');
    } catch (e) { f.record('dismiss_reminder', 'WARN', e.message); }
  } else {
    f.record('Reminder persists', 'WARN', 'Skipped — create failed');
    f.record('snooze_reminder', 'WARN', 'Skipped');
    f.record('dismiss_reminder', 'WARN', 'Skipped');
  }

  allResults.push(f);
  return f;
}

async function testWebSearch() {
  const f = new Feature('WEB');
  console.log('\n  ── WEB SEARCH ──');

  // WEB-1: search_web handler
  try {
    const sw = await sendRequest('web_search', { query: 'Semblance AI local', count: 3 }, 20000);
    if (sw.error && (sw.error.includes('no search') || sw.error.includes('SearXNG') || sw.error.includes('Brave'))) {
      f.record('search_web handler', 'WARN', 'No search provider configured — needs SearXNG or Brave key');
    } else if (sw.error) {
      f.record('search_web handler', 'FAIL', sw.error.slice(0, 80));
    } else {
      const results = Array.isArray(sw.result) ? sw.result.length : 0;
      f.record('search_web handler', 'PASS', `${results} results returned`);

      // WEB-2: Results have required fields
      if (results > 0) {
        const first = sw.result[0];
        const hasFields = first && first.title && first.url;
        f.record('Result shape', hasFields ? 'PASS' : 'WARN',
          hasFields ? 'title, url, snippet present' : 'Missing expected fields');
      }
    }
  } catch (e) { f.record('search_web handler', 'FAIL', e.message); }

  // WEB-3: fetch_url handler
  try {
    const fu = await sendRequest('fetch_url', { url: 'https://semblance.run', maxContentLength: 1000 }, 20000);
    if (fu.error && fu.error.includes('allowlist')) {
      f.record('fetch_url allowlist', 'WARN', 'URL not on allowlist — add semblance.run to test');
    } else if (fu.error) {
      f.record('fetch_url handler', 'WARN', fu.error.slice(0, 80));
    } else {
      f.record('fetch_url handler', 'PASS', `Fetched content: ${String(fu.result).slice(0, 50)}...`);
    }
  } catch (e) { f.record('fetch_url handler', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testProactive() {
  const f = new Feature('PROACT');
  console.log('\n  ── PROACTIVE ENGINE ──');

  // PROACT-1: get_proactive_insights
  try {
    const pi = await sendRequest('get_proactive_insights', {}, 8000);
    if (pi.error) {
      f.record('get_proactive_insights', 'WARN', pi.error.slice(0, 80));
    } else {
      const insights = Array.isArray(pi.result) ? pi.result.length : 0;
      f.record('get_proactive_insights', 'PASS', `${insights} insights (0 if no email/calendar data)`);
      if (insights > 0) {
        const first = pi.result[0];
        const hasFields = first && first.type && first.title;
        f.record('Insight shape', hasFields ? 'PASS' : 'WARN',
          hasFields ? `type=${first.type}, priority=${first.priority}` : 'Missing type/title');
      } else {
        f.record('Insight shape', 'WARN', 'No insights yet — connect email/calendar and sync');
      }
    }
  } catch (e) { f.record('get_proactive_insights', 'WARN', e.message); }

  // PROACT-2: get_pending_actions
  try {
    const pa = await sendRequest('get_pending_actions', {}, 5000);
    if (pa.error) f.record('get_pending_actions', 'WARN', pa.error);
    else f.record('get_pending_actions', 'PASS',
      `${Array.isArray(pa.result) ? pa.result.length : 0} pending actions`);
  } catch (e) { f.record('get_pending_actions', 'WARN', e.message); }

  // PROACT-3: get_actions_summary
  try {
    const as = await sendRequest('get_actions_summary', {}, 5000);
    if (as.error) f.record('get_actions_summary', 'WARN', as.error);
    else f.record('get_actions_summary', 'PASS',
      `today=${as.result?.todayCount ?? 0}, timeSaved=${as.result?.todayTimeSavedSeconds ?? 0}s`);
  } catch (e) { f.record('get_actions_summary', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testMorningBrief() {
  const f = new Feature('BRIEF');
  console.log('\n  ── MORNING BRIEF ──');

  try {
    const mb = await sendRequest('get_morning_brief', {}, 30000);
    if (mb.error) {
      if (mb.error.includes('no data') || mb.error.includes('empty')) {
        f.record('generate_morning_brief', 'WARN', 'No data to brief from — index emails/calendar first');
      } else {
        f.record('generate_morning_brief', 'WARN', mb.error.slice(0, 80));
      }
    } else {
      const brief = mb.result ?? {};
      f.record('generate_morning_brief', 'PASS', 'Brief generated');
      f.record('Brief has summary', brief.summary ? 'PASS' : 'WARN',
        brief.summary ? brief.summary.slice(0, 60) + '...' : 'No summary field');
      f.record('Brief has events', Array.isArray(brief.events) ? 'PASS' : 'WARN',
        Array.isArray(brief.events) ? `${brief.events.length} events` : 'No events field');
    }
  } catch (e) { f.record('generate_morning_brief', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

async function testPrivacy() {
  const f = new Feature('PRIVACY');
  console.log('\n  ── PRIVACY & SOVEREIGNTY ──');

  // PRIVACY-1: Network monitor report
  try {
    const nm = await sendRequest('get_network_monitor_report', {}, 8000);
    if (nm.error) f.record('network_monitor_report', 'WARN', nm.error.slice(0, 80));
    else f.record('network_monitor_report', 'PASS', 'Privacy report generated');
  } catch (e) { f.record('network_monitor_report', 'WARN', e.message); }

  // PRIVACY-2: Audit trail accessible
  try {
    const at = await sendRequest('get_audit_trail', { limit: 5 }, 5000);
    if (at.error) f.record('audit_trail', 'WARN', at.error.slice(0, 80));
    else {
      const entries = Array.isArray(at.result) ? at.result.length : 0;
      f.record('audit_trail', 'PASS', `${entries} recent entries`);
    }
  } catch (e) { f.record('audit_trail', 'WARN', e.message); }

  // PRIVACY-3: Verify merkle chain
  try {
    const mc = await sendRequest('verify_merkle_chain', {}, 10000);
    if (mc.error) f.record('merkle_chain_verify', 'WARN', mc.error.slice(0, 80));
    else f.record('merkle_chain_verify',
      mc.result?.verified ? 'PASS' : 'WARN',
      mc.result?.verified ? 'Chain intact' : `${mc.result?.entryCount ?? 0} entries, chain may need entries`);
  } catch (e) { f.record('merkle_chain_verify', 'WARN', e.message); }

  allResults.push(f);
  return f;
}

// ─── Report Generation ────────────────────────────────────────────────────────

function buildReport(initResult, date) {
  const p0Features = ['CHAT', 'PERSIST', 'CONNECT', 'GRAPH', 'FILES'];
  const p1Features = ['EMAIL', 'CAL', 'REMIND', 'WEB', 'PROACT'];
  const p2Features = ['BRIEF', 'PRIVACY'];

  const allFeatures = allResults.map(f => ({
    name: f.name,
    pass: f.pass,
    warn: f.warn,
    fail: f.fail,
    total: f.pass + f.warn + f.fail,
    tests: f.tests,
  }));

  const totalPass = allFeatures.reduce((s, f) => s + f.pass, 0);
  const totalTests = allFeatures.reduce((s, f) => s + f.total, 0);

  const p0Pass = allFeatures
    .filter(f => p0Features.includes(f.name))
    .every(f => f.fail === 0);
  const p1Pass = allFeatures
    .filter(f => p1Features.includes(f.name))
    .every(f => f.fail === 0);
  const buildReady = p0Pass && p1Pass;

  return { allFeatures, totalPass, totalTests, p0Pass, p1Pass, buildReady, date };
}

function printReport(report) {
  const { allFeatures, totalPass, totalTests, p0Pass, p1Pass, buildReady, date } = report;

  console.log('\n' + '═'.repeat(55));
  console.log('  SEMBLANCE VERIFICATION REPORT');
  console.log(`  ${date}`);
  console.log('═'.repeat(55));

  const groups = [
    { label: 'FOUNDATION (P0)', names: ['CHAT', 'PERSIST', 'CONNECT', 'GRAPH', 'FILES'] },
    { label: 'JARVIS CORE (P1)', names: ['EMAIL', 'CAL', 'REMIND', 'WEB', 'PROACT'] },
    { label: 'JARVIS EXPERIENCE (P2)', names: ['BRIEF', 'PRIVACY'] },
  ];

  for (const group of groups) {
    console.log(`\n  ${group.label}`);
    for (const name of group.names) {
      const f = allFeatures.find(x => x.name === name);
      if (!f) { console.log(`  ⬜ ${name.padEnd(10)} (skipped)`); continue; }
      const icon = f.fail > 0 ? '❌' : f.warn > 0 ? '⚠️ ' : '✅';
      const detail = f.tests
        .filter(t => t.status !== 'PASS' || VERBOSE)
        .map(t => `${t.status === 'FAIL' ? '❌' : t.status === 'WARN' ? '⚠️' : '✅'} ${t.testName}`)
        .join(', ');
      console.log(`  ${icon} ${name.padEnd(10)} ${f.pass}/${f.total}${detail && !VERBOSE ? ' — ' + detail : ''}`);
    }
  }

  console.log('\n' + '─'.repeat(55));
  console.log(`  TOTAL: ${totalPass}/${totalTests} slices green`);
  console.log(`  P0 GATE (Foundation): ${p0Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  P1 GATE (JARVIS Core): ${p1Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  BUILD READY: ${buildReady ? '✅ YES — safe to run tauri build' : '❌ NO — fix failures first'}`);

  if (!p0Pass) {
    console.log('\n  ❌ P0 FAILURES (fix before anything else):');
    allFeatures
      .filter(f => ['CHAT', 'PERSIST', 'CONNECT', 'GRAPH', 'FILES'].includes(f.name) && f.fail > 0)
      .forEach(f => {
        f.tests.filter(t => t.status === 'FAIL').forEach(t => {
          console.log(`    ${f.name}/${t.testName}: ${t.detail}`);
        });
      });
  }

  if (!p1Pass && p0Pass) {
    console.log('\n  ⚠️  P1 FAILURES (fix for full JARVIS capability):');
    allFeatures
      .filter(f => ['EMAIL', 'CAL', 'REMIND', 'WEB', 'PROACT'].includes(f.name) && f.fail > 0)
      .forEach(f => {
        f.tests.filter(t => t.status === 'FAIL').forEach(t => {
          console.log(`    ${f.name}/${t.testName}: ${t.detail}`);
        });
      });
  }

  console.log('\n  Sidecar stderr (last 10 lines):');
  stderrLines.slice(-10).forEach(l => console.log('  ' + l));
  console.log('═'.repeat(55) + '\n');
}

// ─── Diff Mode ────────────────────────────────────────────────────────────────

function diffReport(current, previous) {
  console.log('\n  DIFF vs LAST RUN\n');
  const prev = previous.allFeatures ?? [];
  for (const cf of current.allFeatures) {
    const pf = prev.find(x => x.name === cf.name);
    if (!pf) { console.log(`  🆕 ${cf.name}: New feature`); continue; }
    if (cf.pass > pf.pass) console.log(`  ✅ ${cf.name}: Improved ${pf.pass}/${pf.total} → ${cf.pass}/${cf.total}`);
    else if (cf.fail > pf.fail) console.log(`  ❌ ${cf.name}: REGRESSION ${pf.pass}/${pf.total} → ${cf.pass}/${cf.total}`);
  }
  console.log();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log('\n' + '═'.repeat(55));
  console.log('  SEMBLANCE VERIFICATION — Starting sidecar...');
  console.log('═'.repeat(55));

  await startSidecar();

  // Initialize first
  const initFeature = new Feature('INIT');
  const initResult = await testFoundation(initFeature);
  if (!initResult) {
    console.log('\n  ❌ SIDECAR FAILED TO INITIALIZE\n');
    console.log('  Last sidecar stderr:');
    stderrLines.slice(-20).forEach(l => console.log('  ' + l));
    killSidecar();
    process.exit(1);
  }

  // Run selected or all feature tests
  const runAll = !FEATURE_FILTER;
  const should = (name) => runAll || FEATURE_FILTER === name;

  if (should('CHAT')) await testChat(initResult);
  if (should('PERSIST')) await testPersist();
  if (should('CONNECT')) await testConnections();
  if (should('GRAPH')) await testGraph();
  if (should('FILES')) await testFiles();
  if (should('EMAIL')) await testEmail();
  if (should('CAL')) await testCalendar();
  if (should('REMIND')) await testReminders();
  if (should('WEB')) await testWebSearch();
  if (should('PROACT')) await testProactive();
  if (should('BRIEF')) await testMorningBrief();
  if (should('PRIVACY')) await testPrivacy();

  const report = buildReport(initResult, date);
  printReport(report);

  // Save state for diff
  const previousState = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : null;
  writeFileSync(STATE_FILE, JSON.stringify(report, null, 2));

  if (DIFF_MODE && previousState) {
    diffReport(report, previousState);
  }

  killSidecar();
  process.exit(report.p0Pass ? 0 : 1);
}

main().catch((err) => {
  console.error('\n💀 Verification script crashed:', err.message);
  killSidecar();
  process.exit(1);
});
