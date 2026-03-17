#!/usr/bin/env node
/**
 * SEMBLANCE DATA AUDIT
 *
 * Reads every database and reports what data actually exists — not whether
 * handlers respond, but whether data flows. The critical gap this closes:
 *
 *   OAuth connected + emailAdapter wired + handler exists ≠ emails in the database
 *
 * Usage:
 *   node scripts/data-audit.js              # Full audit
 *   node scripts/data-audit.js --json       # Machine-readable
 *   node scripts/data-audit.js --strict     # Exit 1 if gaps found
 *   node scripts/data-audit.js --verbose    # Extra detail
 *
 * Run at SESSION START and SESSION END. Mandatory for any data-movement feature.
 *
 * Exit codes:  0 = healthy  1 = gaps found  2 = fatal error
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const JSON_MODE   = process.argv.includes('--json');
const STRICT_MODE = process.argv.includes('--strict');
const VERBOSE     = process.argv.includes('--verbose');

const HOME             = os.homedir();
const SEMBLANCE_DATA   = path.join(HOME, '.semblance', 'data');
const SEMBLANCE_GATEWAY = path.join(HOME, '.semblance', 'gateway');

const DB_PATHS = {
  prefs:       path.join(SEMBLANCE_DATA,   'prefs.db'),
  core:        path.join(SEMBLANCE_DATA,   'core.db'),
  documents:   path.join(SEMBLANCE_DATA,   'documents.db'),
  gateway:     path.join(SEMBLANCE_GATEWAY,'gateway.db'),
  oauth:       path.join(SEMBLANCE_GATEWAY,'oauth.db'),
  credentials: path.join(SEMBLANCE_GATEWAY,'credentials.db'),
  audit:       path.join(SEMBLANCE_GATEWAY,'audit.db'),
};

const report = {
  timestamp: new Date().toISOString(),
  databases: {},
  connectedServices: [],
  documentSources: {},
  pipelineGaps: [],
  pipelineHealthy: [],
  handlerStubs: [],
  verdict: 'unknown',
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function openDb(dbPath) {
  try {
    const Database = require('better-sqlite3');
    if (!fs.existsSync(dbPath)) return null;
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch { return null; }
}

function safeQuery(db, sql, params = []) {
  try { return db.prepare(sql).all(...params); } catch { return null; }
}

function safeGet(db, sql, params = []) {
  try { return db.prepare(sql).get(...params); } catch { return null; }
}

function tableExists(db, name) {
  return !!safeGet(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]);
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = { reset:'\x1b[0m', bold:'\x1b[1m', red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m', gray:'\x1b[90m' };
const green  = s => JSON_MODE ? s : `${C.green}${s}${C.reset}`;
const red    = s => JSON_MODE ? s : `${C.red}${s}${C.reset}`;
const yellow = s => JSON_MODE ? s : `${C.yellow}${s}${C.reset}`;
const gray   = s => JSON_MODE ? s : `${C.gray}${s}${C.reset}`;
const bold   = s => JSON_MODE ? s : `${C.bold}${s}${C.reset}`;
const print  = (s = '') => { if (!JSON_MODE) console.log(s); };
const line   = ()       => { if (!JSON_MODE) console.log(gray('─'.repeat(64))); };

// ─── Step 1: OAuth Token Audit ────────────────────────────────────────────────

function auditOAuthTokens() {
  print(); print(bold('OAUTH TOKENS')); line();

  const db = openDb(DB_PATHS.oauth);
  if (!db) {
    print(gray('  oauth.db not found — no OAuth connectors configured yet'));
    report.databases.oauth = { exists: false };
    return {};
  }

  report.databases.oauth = { exists: true };
  const connected = {};
  const tables = safeQuery(db, `SELECT name FROM sqlite_master WHERE type='table'`) || [];
  if (VERBOSE) print(gray(`  Tables in oauth.db: ${tables.map(t => t.name).join(', ')}`));

  if (tableExists(db, 'oauth_tokens')) {
    const tokens = safeQuery(db, 'SELECT * FROM oauth_tokens') || [];
    for (const token of tokens) {
      const provider = token.provider || token.account_id || token.provider_key || 'unknown';
      const expired  = token.expires_at && new Date(token.expires_at) < new Date();
      connected[provider] = { hasToken: true, expired };
      print(`  ${expired ? yellow(`⚠  ${provider} — token EXPIRED`) : green(`✅  ${provider} — token valid`)}`);
    }
  }

  // Catch alternative table names
  for (const tbl of tables) {
    if (tbl.name !== 'oauth_tokens' && tbl.name.toLowerCase().includes('token')) {
      const rows = safeQuery(db, `SELECT * FROM "${tbl.name}" LIMIT 20`) || [];
      for (const row of rows) {
        const key = row.provider || row.key || row.service || tbl.name;
        if (!connected[key]) {
          connected[key] = { hasToken: true, expired: false };
          print(green(`  ✅  ${key} — token found (table: ${tbl.name})`));
        }
      }
    }
  }

  if (Object.keys(connected).length === 0) print(gray('  No OAuth tokens found'));
  db.close();
  return connected;
}

// ─── Step 2: Document Source Audit ───────────────────────────────────────────

function auditDocumentSources() {
  print(); print(bold('KNOWLEDGE GRAPH — DOCUMENT SOURCES')); line();

  let db = openDb(DB_PATHS.documents) || openDb(DB_PATHS.core);
  if (!db) {
    print(gray('  No knowledge graph database found'));
    report.databases.documents = { exists: false };
    return {};
  }

  report.databases.documents = { exists: true };

  if (!tableExists(db, 'documents')) {
    print(gray('  documents table not found — schema not created yet'));
    db.close();
    return {};
  }

  const total = safeGet(db, 'SELECT COUNT(*) as count FROM documents');
  print(`  Total indexed documents: ${bold(String(total?.count ?? 0))}`);

  const bySrc = safeQuery(db, 'SELECT source, COUNT(*) as count FROM documents GROUP BY source ORDER BY count DESC') || [];
  const sources = {};

  if (bySrc.length > 0) {
    print(); print(gray('  By source:'));
    for (const row of bySrc) {
      sources[row.source] = row.count;
      print(`    ${row.count > 0 ? green('✅') : red('❌')}  ${row.source}: ${bold(String(row.count))}`);
    }
  } else {
    print(gray('  No documents indexed yet'));
  }

  if (VERBOSE) {
    const sample = safeQuery(db, `SELECT title FROM documents WHERE source='email' LIMIT 3`) || [];
    if (sample.length > 0) { print(); print(gray('  Email sample:')); sample.forEach(r => print(gray(`    • ${r.title}`))); }
  }

  const last = safeGet(db, 'SELECT indexed_at FROM documents ORDER BY indexed_at DESC LIMIT 1');
  if (last?.indexed_at) print(gray(`  Last indexed: ${last.indexed_at}`));

  report.documentSources = sources;
  db.close();
  return sources;
}

// ─── Step 3: App State Audit ──────────────────────────────────────────────────

function auditAppState() {
  print(); print(bold('APPLICATION STATE')); line();

  let db = openDb(DB_PATHS.prefs) || openDb(DB_PATHS.core);
  if (!db) { print(gray('  No prefs database found')); return {}; }

  const state = {};
  const KEYS = ['user_name','ai_name','onboarding_complete','autonomy_email','search_engine'];
  const tbl = tableExists(db, 'preferences') ? 'preferences' : tableExists(db, 'kv') ? 'kv' : null;

  if (tbl) {
    const rows = safeQuery(db, `SELECT key, value FROM ${tbl} WHERE key IN (${KEYS.map(()=>'?').join(',')})`, KEYS) || [];
    rows.forEach(r => { state[r.key] = r.value; });
  }

  print(`  User name:        ${state.user_name        ? green(state.user_name)                        : gray('(not set)')}`);
  print(`  AI name:          ${state.ai_name          ? green(state.ai_name)                          : gray('(not set)')}`);
  print(`  Onboarding done:  ${state.onboarding_complete === 'true' ? green('yes')                   : yellow('no')}`);
  print(`  Email autonomy:   ${state.autonomy_email   ?? gray('partner (default)')}`);
  print(`  Search engine:    ${state.search_engine    ?? gray('duckduckgo (default)')}`);

  if (tableExists(db, 'reminders')) {
    const r = safeGet(db, `SELECT COUNT(*) as count FROM reminders WHERE status='pending'`);
    print(`  Pending reminders: ${r?.count ?? 0}`);
  }
  if (tableExists(db, 'conversations')) {
    const c = safeGet(db, `SELECT COUNT(*) as count FROM conversations`);
    print(`  Conversations:    ${c?.count ?? 0}`);
  }

  db.close();
  return state;
}

// ─── Step 4: Audit Trail ──────────────────────────────────────────────────────

function auditTrail() {
  print(); print(bold('AUDIT TRAIL')); line();

  const db = openDb(DB_PATHS.audit) || openDb(DB_PATHS.gateway);
  if (!db) { print(gray('  Audit database not found')); return; }

  if (tableExists(db, 'audit_log')) {
    const total  = safeGet(db, 'SELECT COUNT(*) as count FROM audit_log');
    const last24 = safeGet(db, `SELECT COUNT(*) as count FROM audit_log WHERE timestamp > datetime('now','-1 day')`);
    const errors = safeGet(db, `SELECT COUNT(*) as count FROM audit_log WHERE status='error'`);
    print(`  Total entries: ${total?.count ?? 0}`);
    print(`  Last 24h:      ${last24?.count ?? 0}`);
    if ((errors?.count ?? 0) > 0) print(yellow(`  Errors logged: ${errors.count}`));
  } else {
    print(gray('  audit_log table not found'));
  }
  db.close();
}

// ─── Step 5: Pipeline Gap Detection ───────────────────────────────────────────

function detectPipelineGaps(oauthTokens, documentSources) {
  print(); print(bold('PIPELINE GAP DETECTION')); line();

  const PIPELINES = [
    {
      service: 'gmail', oauthKeys: ['gmail','google'], expectedSource: 'email', minimumDocs: 1,
      description: 'Gmail connected but 0 emails in knowledge graph',
      resolution: 'handleConnectorSync does not trigger email indexing post-OAuth. Add emailIndexer.syncFromAdapter() call after successful Gmail auth.',
    },
    {
      service: 'google-drive', oauthKeys: ['google-drive','drive'], expectedSource: 'google-drive', minimumDocs: 1,
      description: 'Google Drive connected but 0 files in knowledge graph',
      resolution: 'handleConnectorSync does not trigger Drive file indexing post-OAuth. Add Drive listing + indexDocument() calls after successful Drive auth.',
    },
    {
      service: 'google-calendar', oauthKeys: ['google-calendar','calendar'], expectedSource: 'calendar', minimumDocs: 0,
      description: 'Google Calendar connected (uses calendarIndexer — not knowledge graph docs)',
      resolution: '',
    },
    {
      service: 'slack', oauthKeys: ['slack'], expectedSource: 'slack', minimumDocs: 0,
      description: 'Slack connected (indexing not yet implemented)',
      resolution: '',
    },
  ];

  const connectedKeys = Object.keys(oauthTokens).map(k => k.toLowerCase());
  const gaps = []; const healthy = [];
  let anyConnected = false;

  for (const p of PIPELINES) {
    const isConnected = p.oauthKeys.some(key => connectedKeys.some(k => k.includes(key)));
    if (!isConnected) continue;
    anyConnected = true;
    report.connectedServices.push(p.service);

    if (p.minimumDocs === 0) {
      print(green(`  ✅  ${p.service} — connected (data indexing not applicable)`));
      healthy.push(p.service);
      continue;
    }

    const count = documentSources[p.expectedSource] ?? 0;
    if (count >= p.minimumDocs) {
      print(green(`  ✅  ${p.service} → ${p.expectedSource}: ${count} documents`));
      healthy.push(p.service);
    } else {
      print(red(`  ❌  ${p.service} → ${p.expectedSource}: ${count} documents (expected ≥${p.minimumDocs})`));
      print(yellow(`      ${p.description}`));
      print(gray(`      Fix: ${p.resolution}`));
      gaps.push({ service: p.service, expectedSource: p.expectedSource, actualCount: count, minimumExpected: p.minimumDocs, description: p.description, resolution: p.resolution });
    }
  }

  if (!anyConnected) print(gray('  No OAuth services connected — connect a service to detect pipeline gaps'));

  report.pipelineGaps = gaps;
  report.pipelineHealthy = healthy;
  return gaps;
}

// ─── Step 6: Handler Stub Detection ──────────────────────────────────────────

function detectHandlerStubs() {
  print(); print(bold('HANDLER STUB DETECTION')); line();

  const KNOWN_STUBS = [
    { method: 'get_proactive_insights', expected: 'proactive insight objects from proactiveEngine' },
    { method: 'get_today_events',       expected: 'calendar events from calendarIndexer.getUpcomingEvents()' },
    { method: 'get_pending_actions',    expected: 'pending action objects from prefsDb pending_actions table' },
    { method: 'get_reminders',          expected: 'reminder objects from reminders table' },
    { method: 'get_dark_pattern_flags', expected: 'dark pattern flags from prefsDb' },
    { method: 'get_clipboard_insights', expected: 'clipboard insight objects' },
  ];

  const candidates = [
    path.join(__dirname, '..', 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts'),
    'C:\\Users\\skyle\\desktop\\world-shattering\\semblance\\packages\\desktop\\src-tauri\\sidecar\\bridge.ts',
  ];

  let bridgeContent = null;
  for (const p of candidates) {
    try { bridgeContent = fs.readFileSync(p, 'utf8'); break; } catch { /* try next */ }
  }

  if (!bridgeContent) { print(gray('  bridge.ts not readable — skipping stub check')); return []; }

  const stubs = [];
  for (const stub of KNOWN_STUBS) {
    const regex = new RegExp(`case '${stub.method}':[\\s\\S]{0,300}respond\\(id,\\s*\\[\\]\\)`, 'm');
    if (regex.test(bridgeContent)) {
      print(yellow(`  ⚠  '${stub.method}' → hardcoded [] stub`));
      print(gray(`      Should return: ${stub.expected}`));
      stubs.push(stub.method);
    } else if (VERBOSE) {
      print(green(`  ✅  '${stub.method}' — not a stub`));
    }
  }

  if (stubs.length === 0) print(green('  ✅  No hardcoded empty-array stubs detected'));
  report.handlerStubs = stubs;
  return stubs;
}

// ─── Step 7: Verdict + Save ────────────────────────────────────────────────────

function renderVerdict(gaps, stubs) {
  print(); print(bold('═'.repeat(64)));
  const total = gaps.length + stubs.length;

  if (total === 0) {
    print(green(bold('  VERDICT: PIPELINE HEALTHY — no gaps detected')));
    report.verdict = 'healthy';
  } else {
    print(red(bold(`  VERDICT: ${total} PIPELINE ISSUE(S) DETECTED`)));
    report.verdict = 'gaps-found';
    print();
    if (gaps.length > 0) {
      print(red(`  Pipeline gaps (connected services producing no data):`));
      gaps.forEach(g => {
        print(red(`    • ${g.service} → ${g.expectedSource}: ${g.actualCount} docs (need ≥${g.minimumExpected})`));
        print(gray(`      ${g.resolution}`));
      });
    }
    if (stubs.length > 0) {
      print(yellow(`  Hardcoded stubs (returning [] instead of real data):`));
      stubs.forEach(s => print(yellow(`    • ${s}`)));
    }
    print();
    print(yellow('  These gaps MUST be resolved before this session is marked complete.'));
    print(yellow('  Run /pipeline-fix for the resolution protocol.'));
  }

  print(bold('═'.repeat(64))); print();
}

function saveState() {
  const stateDir = path.join(__dirname, '..', '.semblance-verify');
  if (!fs.existsSync(stateDir)) { try { fs.mkdirSync(stateDir, { recursive: true }); } catch { return; } }
  try { fs.writeFileSync(path.join(stateDir, 'data-audit.json'), JSON.stringify(report, null, 2)); } catch { /* non-fatal */ }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!JSON_MODE) {
    print();
    print(bold('\x1b[36mSEMBLANCE DATA AUDIT\x1b[0m'));
    print(gray(`  ${new Date().toLocaleString()}`));
    print(gray('  Verifying data flows through every connected pipeline'));
  }

  let oauthTokens = {}, documentSources = {}, gaps = [], stubs = [];

  try { oauthTokens = auditOAuthTokens(); }      catch (e) { print(red(`  OAuth audit failed: ${e.message}`)); }
  try { documentSources = auditDocumentSources(); } catch (e) { print(red(`  Document audit failed: ${e.message}`)); }
  try { auditAppState(); }                        catch (e) { print(red(`  App state audit failed: ${e.message}`)); }
  try { auditTrail(); }                           catch { /* non-fatal */ }
  try { gaps = detectPipelineGaps(oauthTokens, documentSources); } catch (e) { print(red(`  Gap detection failed: ${e.message}`)); }
  try { stubs = detectHandlerStubs(); }           catch { /* non-fatal */ }

  renderVerdict(gaps, stubs);
  saveState();

  if (JSON_MODE) console.log(JSON.stringify(report, null, 2));
  process.exit(STRICT_MODE && (gaps.length > 0 || stubs.length > 0) ? 1 : 0);
}

main().catch(err => { console.error('Data audit fatal error:', err); process.exit(2); });
