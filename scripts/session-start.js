#!/usr/bin/env node
/**
 * SESSION START — Automated Phase 1
 *
 * Replaces the manual 4-step session start with a single command.
 * Reads state, runs baseline verification, detects regressions from
 * last session, and prints a formatted START report.
 *
 * Usage:
 *   node scripts/session-start.js              # Full session start
 *   node scripts/session-start.js --skip-verify # Skip verify (state review only)
 *
 * Exit code: 0 always (informational — does not block work)
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const SKIP_VERIFY = process.argv.includes('--skip-verify');

const STATE_DIR = join(ROOT, '.semblance-verify');
const BASELINE_FILE = join(STATE_DIR, 'session-baseline.json');
const SESSION_LOG_FILE = join(STATE_DIR, 'session-log.ndjson');

const STATE_MD = join(
  ROOT, '..', 'semblence-representative', 'docs', 'SEMBLANCE_STATE.md'
);
const CONTRACTS_MD = join(
  ROOT, '..', 'semblence-representative', 'docs', 'SLICE_CONTRACTS.md'
);

if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findPreviousSessionFinal() {
  // Find the most recent session-final-*.json
  if (!existsSync(STATE_DIR)) return null;
  const finals = readdirSync(STATE_DIR)
    .filter(f => f.startsWith('session-final-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (finals.length === 0) return null;
  return JSON.parse(readFileSync(join(STATE_DIR, finals[0]), 'utf8'));
}

function detectRegressions(current, previous) {
  if (!previous || !previous.allFeatures || !current.allFeatures) return [];
  const regressions = [];
  for (const cf of current.allFeatures) {
    const pf = previous.allFeatures.find(x => x.name === cf.name);
    if (!pf) continue;
    // Regression: was passing (0 fails), now failing
    if (pf.fail === 0 && cf.fail > 0) {
      const failedTests = cf.tests
        .filter(t => t.status === 'FAIL')
        .map(t => t.testName)
        .join(', ');
      regressions.push({
        feature: cf.name,
        was: `${pf.pass}/${pf.total} green`,
        now: `${cf.pass}/${cf.total} green, ${cf.fail} FAIL`,
        failedTests,
      });
    }
    // Also flag: was all-pass, now has warnings where it didn't
    if (pf.warn === 0 && pf.fail === 0 && cf.warn > 0 && cf.fail === 0) {
      regressions.push({
        feature: cf.name,
        was: `${pf.pass}/${pf.total} all green`,
        now: `${cf.pass}/${cf.total} green, ${cf.warn} warnings`,
        failedTests: '(new warnings)',
      });
    }
  }
  return regressions;
}

// ─── Dependency Map ──────────────────────────────────────────────────────────
// Maps environment prerequisites to the features they block

const DEPENDENCY_MAP = {
  'Ollama running + model pulled': {
    check: () => {
      try {
        execSync('ollama list 2>&1', { encoding: 'utf8', timeout: 5000 });
        return true;
      } catch { return false; }
    },
    blocks: ['CHAT', 'BRIEF', 'PROACT', 'EMAIL (drafting)'],
    fix: 'ollama serve && ollama pull llama3.1:8b',
  },
  '.env with Google OAuth credentials': {
    check: () => {
      const envPath = join(ROOT, '.env');
      if (!existsSync(envPath)) return false;
      const content = readFileSync(envPath, 'utf8');
      return content.includes('GOOGLE_CLIENT_ID') && content.includes('GOOGLE_CLIENT_SECRET');
    },
    blocks: ['CONNECT (Google)', 'EMAIL (Gmail)', 'CAL'],
    fix: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env',
  },
  'SearXNG or Brave API key': {
    check: () => {
      const envPath = join(ROOT, '.env');
      if (!existsSync(envPath)) return false;
      const content = readFileSync(envPath, 'utf8');
      return content.includes('BRAVE_API_KEY') || content.includes('SEARXNG');
    },
    blocks: ['WEB'],
    fix: 'Add BRAVE_API_KEY to .env or run SearXNG locally',
  },
};

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const date = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const today = new Date().toISOString().slice(0, 10);

  console.log('\n' + '═'.repeat(60));
  console.log('  SESSION START');
  console.log(`  ${date}`);
  console.log('═'.repeat(60));

  // ── Step 1.1: Read SEMBLANCE_STATE.md ────────────────────────────────────
  console.log('\n  [1/4] READING SEMBLANCE_STATE.md\n');

  if (!existsSync(STATE_MD)) {
    console.log('  ❌ SEMBLANCE_STATE.md not found at expected path');
    console.log(`     Expected: ${STATE_MD}`);
  } else {
    const stateContent = readFileSync(STATE_MD, 'utf8');

    // Parse key info
    const lastUpdated = stateContent.match(/\*\*Last Updated:\*\* (.+)/)?.[1] || 'unknown';
    const updatedBy = stateContent.match(/\*\*Updated By:\*\* (.+)/)?.[1] || 'unknown';

    // Count feature statuses
    const greenCount = (stateContent.match(/✅/g) || []).length;
    const yellowCount = (stateContent.match(/⚠️/g) || []).length;
    const redCount = (stateContent.match(/❌/g) || []).length;
    const untestedCount = (stateContent.match(/🔲/g) || []).length;

    console.log(`  Last updated: ${lastUpdated} by ${updatedBy}`);
    console.log(`  Feature status: ✅ ${greenCount}  ⚠️ ${yellowCount}  ❌ ${redCount}  🔲 ${untestedCount}`);

    // Parse active issues
    const issueMatches = stateContent.match(/\*\*Issue \d+:.+?\*\*/g) || [];
    if (issueMatches.length > 0) {
      console.log(`\n  Active issues (${issueMatches.length}):`);
      issueMatches.forEach(i => console.log(`    • ${i.replace(/\*\*/g, '')}`));
    }

    // Parse in-progress
    const inProgressSection = stateContent.match(/## IN PROGRESS\n\n([\s\S]*?)(?=\n---)/)?.[1]?.trim();
    if (inProgressSection && !inProgressSection.includes('Nothing in progress')) {
      console.log(`\n  In progress from last session:`);
      console.log(`    ${inProgressSection.slice(0, 200)}`);
    }
  }

  // ── Step 1.2: Read SLICE_CONTRACTS.md ────────────────────────────────────
  console.log('\n  [2/4] CHECKING SLICE CONTRACTS\n');

  if (!existsSync(CONTRACTS_MD)) {
    console.log('  ❌ SLICE_CONTRACTS.md not found');
  } else {
    const contractContent = readFileSync(CONTRACTS_MD, 'utf8');
    const contractHeaders = contractContent.match(/^## .+/gm) || [];
    console.log(`  ${contractHeaders.length} feature contracts available:`);
    contractHeaders.slice(0, 15).forEach(h => console.log(`    ${h}`));
    if (contractHeaders.length > 15) console.log(`    ... and ${contractHeaders.length - 15} more`);
  }

  // ── Step 1.2b: Check environment prerequisites ──────────────────────────
  console.log('\n  ENVIRONMENT PREREQUISITES\n');

  const blockedFeatures = [];
  for (const [name, dep] of Object.entries(DEPENDENCY_MAP)) {
    const available = dep.check();
    const icon = available ? '✅' : '❌';
    console.log(`  ${icon} ${name}`);
    if (!available) {
      console.log(`     Blocks: ${dep.blocks.join(', ')}`);
      console.log(`     Fix: ${dep.fix}`);
      blockedFeatures.push(...dep.blocks);
    }
  }

  if (blockedFeatures.length > 0) {
    console.log(`\n  ⚠️  ${blockedFeatures.length} feature(s) blocked by missing prerequisites`);
  }

  // ── Step 1.3: Run verification baseline ──────────────────────────────────
  let currentReport = null;

  if (SKIP_VERIFY) {
    console.log('\n  [3/4] VERIFICATION BASELINE — skipped (--skip-verify)\n');
  } else {
    console.log('\n  [3/4] RUNNING VERIFICATION BASELINE\n');
    console.log('  This takes ~60-120s (starts sidecar, tests all features)...\n');

    const result = spawnSync('node', ['scripts/semblance-verify.js'], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300000,
      stdio: 'inherit',
    });

    // Read the output
    const latestFile = join(STATE_DIR, 'latest.json');
    if (existsSync(latestFile)) {
      currentReport = JSON.parse(readFileSync(latestFile, 'utf8'));
      // Save as session baseline
      writeFileSync(BASELINE_FILE, JSON.stringify(currentReport, null, 2));
      console.log(`\n  Baseline saved to ${BASELINE_FILE}`);
    }
  }

  // ── Step 1.4: Regression tripwire ────────────────────────────────────────
  console.log('\n  [4/4] REGRESSION CHECK\n');

  const previousFinal = findPreviousSessionFinal();

  if (!previousFinal) {
    console.log('  No previous session final state found — this is the first workflow-governed session.');
    console.log('  Baseline established. Regressions will be tracked from next session onward.');
  } else if (currentReport) {
    const regressions = detectRegressions(currentReport, previousFinal);
    const prevDate = previousFinal.date || 'unknown';

    if (regressions.length === 0) {
      console.log(`  ✅ No regressions detected since last session (${prevDate})`);
    } else {
      console.log(`  ⚠️  REGRESSIONS DETECTED since ${prevDate}:\n`);
      for (const r of regressions) {
        console.log(`    ❌ ${r.feature}: was ${r.was} → now ${r.now}`);
        if (r.failedTests) console.log(`       Failed: ${r.failedTests}`);
      }
      console.log('\n  These features were working last session and are now broken.');
      console.log('  Investigate before starting new work.');
    }
  } else {
    console.log('  Skipped (no current verification run)');
  }

  // ── Clear session log for new session ────────────────────────────────────
  writeFileSync(SESSION_LOG_FILE, '');

  // ── START report ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  SESSION START REPORT');
  console.log('═'.repeat(60));
  console.log(`  Date: ${date}`);
  console.log(`  SEMBLANCE_STATE reviewed: ${existsSync(STATE_MD) ? '✅' : '❌'}`);
  console.log(`  Contracts loaded: ${existsSync(CONTRACTS_MD) ? '✅' : '❌'}`);

  if (currentReport) {
    const vel = currentReport.allFeatures.reduce((acc, f) => {
      acc.pass += f.pass;
      acc.total += f.total;
      acc.green += (f.fail === 0 && f.warn === 0) ? 1 : 0;
      acc.yellow += (f.fail === 0 && f.warn > 0) ? 1 : 0;
      acc.red += f.fail > 0 ? 1 : 0;
      return acc;
    }, { pass: 0, total: 0, green: 0, yellow: 0, red: 0 });

    console.log(`  Baseline: ${vel.pass}/${vel.total} assertions | ${vel.green}✅ ${vel.yellow}⚠️ ${vel.red}❌ features`);
    console.log(`  P0 Gate: ${currentReport.p0Pass ? '✅ PASS' : '❌ FAIL'}`);
  }

  if (blockedFeatures.length > 0) {
    console.log(`  Env blockers: ${[...new Set(blockedFeatures)].join(', ')}`);
  }

  console.log(`\n  Session checkpoint log: ${SESSION_LOG_FILE}`);
  console.log('  Use: node scripts/checkpoint.js "description of change" to log progress');

  // Create session-active flag — unlocks Edit/Write tool calls and git commits.
  // Without this flag, the PreToolUse hook blocks ALL code changes.
  const semblanceDir = join(require('os').homedir(), '.semblance');
  if (!existsSync(semblanceDir)) mkdirSync(semblanceDir, { recursive: true });
  writeFileSync(join(semblanceDir, '.session-active'), new Date().toISOString());
  console.log('\n  Session flag: ~/.semblance/.session-active CREATED');
  console.log('  Edit/Write tools and git commits are now UNLOCKED.');

  console.log('\n  Ready to work. What\'s on the agenda?');
  console.log('═'.repeat(60) + '\n');
}

main().catch(e => {
  console.error('\nSession start crashed:', e.message);
  process.exit(1);
});
