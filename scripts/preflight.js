/**
 * PREFLIGHT — Pre-build gate
 *
 * Full pre-build checklist. Must pass before any tauri build or ship claim.
 * Runs: TypeScript check → tests → stub scan → privacy audit → sidecar smoke → P0 verify
 *
 * Usage:
 *   node scripts/preflight.js              # Full preflight
 *   node scripts/preflight.js --fast       # TypeScript + tests + stubs + privacy (no sidecar)
 *
 * Exit code: 0 = BUILD READY, 1 = BLOCKED
 */

'use strict';

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const FAST = process.argv.includes('--fast');

let passed = 0;
let failed = 0;
const results = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
    results.push(`  ✅ ${label}`);
  } else {
    failed++;
    results.push(`  ❌ ${label}${detail ? ': ' + detail : ''}`);
  }
}

function run(cmd, args, timeoutMs = 120000) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}

console.log('\n' + '═'.repeat(60));
console.log('  SEMBLANCE PREFLIGHT');
console.log('  ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
console.log('═'.repeat(60) + '\n');

// ── 1. TypeScript ─────────────────────────────────────────────────────────
process.stdout.write('  Checking TypeScript... ');
const ts = run('npx', ['tsc', '--noEmit'], 60000);
check('TypeScript clean', ts.ok, ts.ok ? '' : 'compilation errors found');
console.log(ts.ok ? 'clean' : 'FAILED');

// ── 2. Tests ──────────────────────────────────────────────────────────────
process.stdout.write('  Running tests... ');
const tests = run('npx', ['vitest', 'run'], 300000);
const testMatch = tests.stdout.match(/(\d+) passed/);
const failMatch = tests.stdout.match(/(\d+) failed/);
const skipMatch = tests.stdout.match(/(\d+) skipped/);
const testsPassed = testMatch ? parseInt(testMatch[1]) : 0;
const testsFailed = failMatch ? parseInt(failMatch[1]) : 0;
const testsSkipped = skipMatch ? parseInt(skipMatch[1]) : 0;
const testsOk = tests.ok && testsFailed === 0;
check(`Tests (${testsPassed} passing, ${testsFailed} failing, ${testsSkipped} skipped)`, testsOk);
console.log(testsOk ? `${testsPassed} passing` : `FAILED (${testsFailed} failures)`);

// ── 3. Stub scan ──────────────────────────────────────────────────────────
process.stdout.write('  Scanning for stubs... ');
const stubScan = run('grep', ['-rn', '--include=*.ts', 'TODO.*stub\\|PLACEHOLDER\\|not implemented', 'packages/core/', 'packages/gateway/'], 15000);
const stubLines = stubScan.stdout.trim().split('\n').filter(l => l.trim() && !l.includes('node_modules'));
const noStubs = stubLines.length === 0;
check(`No stubs (${noStubs ? '0' : stubLines.length} found)`, noStubs, noStubs ? '' : stubLines.slice(0, 3).join('; '));
console.log(noStubs ? 'clean' : `${stubLines.length} stub(s) found`);

// ── 4. Privacy audit ─────────────────────────────────────────────────────
process.stdout.write('  Privacy audit... ');
const privacy = run('node', ['scripts/privacy-audit/index.js'], 30000);
check('Privacy audit', privacy.ok, privacy.ok ? '' : 'network imports in AI Core');
console.log(privacy.ok ? 'PASS' : 'FAIL');

if (!FAST) {
  // ── 5. Sidecar smoke ───────────────────────────────────────────────────
  const sidecarPath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');
  if (!existsSync(sidecarPath)) {
    check('Sidecar bundle', false, 'bridge.cjs not found — run: node scripts/bundle-sidecar.js');
    console.log('  Sidecar: NOT BUNDLED — run node scripts/bundle-sidecar.js first');
  } else {
    process.stdout.write('  Sidecar smoke... ');
    const smoke = run('node', ['scripts/smoke-test-sidecar.js'], 60000);
    check('Sidecar smoke', smoke.ok, smoke.ok ? '' : 'sidecar failed to start or respond');
    console.log(smoke.ok ? 'PASS' : 'FAIL');
  }

  // ── 6. Verify P0 ─────────────────────────────────────────────────────
  process.stdout.write('  P0 verification... ');
  const verify = run('node', ['scripts/semblance-verify.js'], 300000);
  const p0Match = verify.stdout.match(/P0\s+(PASS|FAIL)/);
  const p0Ok = p0Match ? p0Match[1] === 'PASS' : false;
  check('P0 gate', p0Ok, p0Ok ? '' : 'P0 features failing');
  console.log(p0Ok ? 'PASS' : 'FAIL');
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
results.forEach(r => console.log(r));
console.log('─'.repeat(60));

const buildReady = failed === 0;
console.log(`\n  ${buildReady ? '🟢 BUILD READY: YES' : '🔴 BUILD READY: NO — ' + failed + ' gate(s) failing'}`);
console.log(`  ${passed} passing, ${failed} failing\n`);

process.exit(buildReady ? 0 : 1);
