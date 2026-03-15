#!/usr/bin/env node
/**
 * SESSION END — Automated Phase 3
 *
 * Replaces the manual 7-step session end with a single command.
 * Runs verification, diffs against baseline, runs preflight,
 * auto-patches state, generates session log entry, prints END report.
 *
 * Usage:
 *   node scripts/session-end.js              # Full session end
 *   node scripts/session-end.js --skip-verify # Skip verify (state update only)
 *   node scripts/session-end.js --build      # Include install-verify (build sessions)
 *
 * Exit code: 0 = session closed cleanly, 1 = issues found
 */

'use strict';

const { spawnSync, execSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const SKIP_VERIFY = process.argv.includes('--skip-verify');
const BUILD_SESSION = process.argv.includes('--build');

const STATE_DIR = join(ROOT, '.semblance-verify');
const BASELINE_FILE = join(STATE_DIR, 'session-baseline.json');
const LATEST_FILE = join(STATE_DIR, 'latest.json');
const SESSION_LOG_FILE = join(STATE_DIR, 'session-log.ndjson');

const STATE_MD = join(
  ROOT, '..', 'semblence-representative', 'docs', 'SEMBLANCE_STATE.md'
);

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
}

function readCheckpoints() {
  if (!existsSync(SESSION_LOG_FILE)) return [];
  const content = readFileSync(SESSION_LOG_FILE, 'utf8').trim();
  if (!content) return [];
  return content.split('\n').map(line => {
    try { return JSON.parse(line); }
    catch { return null; }
  }).filter(Boolean);
}

function diffReports(current, baseline) {
  if (!baseline || !current) return { improved: [], regressed: [], unchanged: [] };
  const improved = [];
  const regressed = [];
  const unchanged = [];

  for (const cf of current.allFeatures) {
    const bf = baseline.allFeatures?.find(x => x.name === cf.name);
    if (!bf) { improved.push({ name: cf.name, detail: 'New feature' }); continue; }

    if (cf.fail < bf.fail || (cf.fail === bf.fail && cf.pass > bf.pass)) {
      improved.push({
        name: cf.name,
        was: `${bf.pass}/${bf.total}`,
        now: `${cf.pass}/${cf.total}`,
      });
    } else if (cf.fail > bf.fail || (cf.fail === bf.fail && cf.pass < bf.pass)) {
      regressed.push({
        name: cf.name,
        was: `${bf.pass}/${bf.total}`,
        now: `${cf.pass}/${cf.total}`,
        failedTests: cf.tests.filter(t => t.status === 'FAIL').map(t => t.testName).join(', '),
      });
    } else {
      unchanged.push(cf.name);
    }
  }
  return { improved, regressed, unchanged };
}

function velocitySummary(features) {
  return features.reduce((acc, f) => {
    acc.pass += f.pass;
    acc.total += f.total;
    acc.green += (f.fail === 0 && f.warn === 0) ? 1 : 0;
    acc.yellow += (f.fail === 0 && f.warn > 0) ? 1 : 0;
    acc.red += f.fail > 0 ? 1 : 0;
    return acc;
  }, { pass: 0, total: 0, green: 0, yellow: 0, red: 0 });
}

function generateSessionLogEntry(date, checkpoints, diff, currentReport, baseline) {
  const vel = currentReport ? velocitySummary(currentReport.allFeatures) : null;
  const baseVel = baseline ? velocitySummary(baseline.allFeatures) : null;

  const changeList = checkpoints.length > 0
    ? checkpoints.map(c => `- ${c.message}${c.files ? ' (' + c.files + ')' : ''}`).join('\n')
    : '- (no checkpoints logged this session)';

  const greenDelta = vel && baseVel ? vel.green - baseVel.green : 0;
  const regressionCount = diff.regressed.length;

  const p0Remaining = currentReport
    ? currentReport.allFeatures
        .filter(f => ['CHAT', 'PERSIST', 'CONNECT', 'GRAPH', 'FILES'].includes(f.name) && f.fail > 0)
        .length
    : '?';

  return `
### ${date.slice(0, 10)} — Claude Code
**Type:** ${checkpoints.length > 0 ? 'Fix / Feature' : 'Verification'}
**What changed:**
${changeList}

**Verification delta:**
${diff.improved.map(i => `- ✅ ${i.name}: ${i.was || 'new'} → ${i.now || 'added'}`).join('\n') || '- No improvements'}
${diff.regressed.map(r => `- ❌ ${r.name}: ${r.was} → ${r.now} (${r.failedTests})`).join('\n') || ''}

**Regressions introduced:** ${regressionCount === 0 ? 'None' : regressionCount}

**Velocity:**
- Features moved to ✅ this session: ${greenDelta >= 0 ? '+' : ''}${greenDelta}
- Features regressed this session: ${regressionCount}
- P0 features remaining (❌): ${p0Remaining}/5
- Assertions passing: ${vel ? `${vel.pass}/${vel.total}` : 'N/A'}
`.trim();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const today = new Date().toISOString().slice(0, 10);

  console.log('\n' + '═'.repeat(60));
  console.log('  SESSION END');
  console.log(`  ${date}`);
  console.log('═'.repeat(60));

  const baseline = readBaseline();
  const checkpoints = readCheckpoints();

  console.log(`\n  Session checkpoints logged: ${checkpoints.length}`);
  if (checkpoints.length > 0) {
    checkpoints.forEach(c => console.log(`    • [${c.timestamp?.slice(11, 19) || '?'}] ${c.message}`));
  }

  // ── Step 3.1: Run full verification ──────────────────────────────────────
  let currentReport = null;

  if (SKIP_VERIFY) {
    console.log('\n  [1/5] VERIFICATION — skipped');
    if (existsSync(LATEST_FILE)) {
      currentReport = JSON.parse(readFileSync(LATEST_FILE, 'utf8'));
    }
  } else {
    console.log('\n  [1/5] RUNNING FULL VERIFICATION\n');
    spawnSync('node', ['scripts/semblance-verify.js'], {
      cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: 'inherit',
    });
    if (existsSync(LATEST_FILE)) {
      currentReport = JSON.parse(readFileSync(LATEST_FILE, 'utf8'));
    }
  }

  // ── Step 3.2: Run preflight ──────────────────────────────────────────────
  console.log('\n  [2/5] RUNNING PREFLIGHT\n');
  spawnSync('node', ['scripts/preflight.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 360000, stdio: 'inherit',
  });

  // ── Step 3.2b: Install-verify (build sessions) ──────────────────────────
  if (BUILD_SESSION) {
    console.log('\n  [2b/5] RUNNING INSTALL-VERIFY (build session)\n');
    spawnSync('node', ['scripts/install-and-verify.js'], {
      cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: 'inherit',
    });
  }

  // ── Step 3.3: Diff against baseline ──────────────────────────────────────
  console.log('\n  [3/5] SESSION DIFF\n');

  const diff = diffReports(currentReport, baseline);

  if (!baseline) {
    console.log('  No session baseline found — cannot compute diff.');
    console.log('  (Did session-start.js run at the start of this session?)');
  } else {
    if (diff.improved.length > 0) {
      console.log('  IMPROVED:');
      diff.improved.forEach(i => console.log(`    ✅ ${i.name}: ${i.was || 'new'} → ${i.now || 'added'}`));
    }
    if (diff.regressed.length > 0) {
      console.log('\n  ⚠️  REGRESSED:');
      diff.regressed.forEach(r => console.log(`    ❌ ${r.name}: ${r.was} → ${r.now} — ${r.failedTests}`));
    }
    if (diff.improved.length === 0 && diff.regressed.length === 0) {
      console.log('  No feature status changes this session.');
    }
  }

  // ── Step 3.4: Auto-update SEMBLANCE_STATE.md ─────────────────────────────
  console.log('\n  [4/5] AUTO-UPDATING STATE\n');

  if (currentReport) {
    spawnSync('node', ['scripts/update-state.js'], {
      cwd: ROOT, encoding: 'utf8', timeout: 30000, stdio: 'inherit',
    });
  } else {
    console.log('  Skipped — no verification data available.');
  }

  // ── Step 3.4b: Append session log entry ──────────────────────────────────
  if (existsSync(STATE_MD) && currentReport) {
    const logEntry = generateSessionLogEntry(date, checkpoints, diff, currentReport, baseline);

    const stateContent = readFileSync(STATE_MD, 'utf8');
    const insertPoint = stateContent.indexOf('## SESSION LOG');
    if (insertPoint !== -1) {
      // Find the line after "## SESSION LOG" and the separator line
      const afterHeader = stateContent.indexOf('\n', insertPoint);
      const afterMeta = stateContent.indexOf('\n', afterHeader + 1); // skip the italic instruction line
      const afterSeparator = stateContent.indexOf('\n---\n', afterMeta);

      if (afterSeparator !== -1) {
        // Insert after the --- separator
        const newContent = stateContent.slice(0, afterSeparator + 5) + '\n' + logEntry + '\n' + stateContent.slice(afterSeparator + 5);
        writeFileSync(STATE_MD, newContent);
        console.log('\n  Session log entry appended to SEMBLANCE_STATE.md');
      }
    }
  }

  // ── Step 3.5: Save session final state ───────────────────────────────────
  if (currentReport) {
    const finalFile = join(STATE_DIR, `session-final-${today}.json`);
    writeFileSync(finalFile, JSON.stringify(currentReport, null, 2));
    console.log(`  Session final state saved to ${finalFile}`);
  }

  // ── Step 3.5: Gap detection prompts ──────────────────────────────────────
  console.log('\n  [5/5] GAP DETECTION\n');
  console.log('  Review these questions before closing:');
  console.log('    1. What does each changed feature assume is initialized before it runs?');
  console.log('    2. What data shape assumptions could other code violate?');
  console.log('    3. What other features touch the same DB tables / IPC handlers?');
  console.log('    4. If next session changes [X], what breaks in what you just built?');

  if (checkpoints.length > 0) {
    const allFiles = checkpoints
      .filter(c => c.files)
      .flatMap(c => c.files.split(',').map(f => f.trim()))
      .filter(Boolean);
    const uniqueFiles = [...new Set(allFiles)];
    if (uniqueFiles.length > 0) {
      console.log(`\n  Files touched this session (${uniqueFiles.length}):`);
      uniqueFiles.forEach(f => console.log(`    ${f}`));
    }
  }

  // ── END Report ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SESSION END REPORT');
  console.log('═'.repeat(60));
  console.log(`  Date: ${date}`);
  console.log(`  Checkpoints: ${checkpoints.length}`);

  if (currentReport) {
    const vel = velocitySummary(currentReport.allFeatures);
    console.log(`  Final state: ${vel.pass}/${vel.total} assertions | ${vel.green}✅ ${vel.yellow}⚠️ ${vel.red}❌`);
    console.log(`  P0 Gate: ${currentReport.p0Pass ? '✅ PASS' : '❌ FAIL'}`);
  }

  console.log(`  Improved: ${diff.improved.length} features`);
  console.log(`  Regressed: ${diff.regressed.length} features`);
  console.log(`  Session final: saved for next session regression tracking`);

  // Remove session-active flag — locks Edit/Write tools and git commits until next session-start.
  const sessionFlag = join(require('os').homedir(), '.semblance', '.session-active');
  const verifyFlag = join(require('os').homedir(), '.semblance', '.last-verify');
  try { require('fs').unlinkSync(sessionFlag); } catch { /* already removed */ }
  try { require('fs').unlinkSync(verifyFlag); } catch { /* already removed */ }
  console.log(`  Session flags: REMOVED (Edit/Write locked until next session-start)`);

  console.log('═'.repeat(60) + '\n');

  process.exit(diff.regressed.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\nSession end crashed:', e.message);
  process.exit(1);
});
