/**
 * BUILD AND VERIFY — Full binary build pipeline
 *
 * Runs the complete pipeline: preflight → bundle sidecar → tauri build → install-verify
 *
 * Usage:
 *   node scripts/build-and-verify.js                    # Full pipeline
 *   node scripts/build-and-verify.js --skip-preflight   # Skip preflight gate
 *   node scripts/build-and-verify.js --skip-install     # Skip post-install verify
 *   node scripts/build-and-verify.js --target=windows   # Explicit target (windows/macos/linux)
 *
 * Exit code: 0 = build succeeded and verified, 1 = failed at any stage
 *
 * IMPORTANT: This is the canonical binary build script. Do not run
 * `npx tauri build` directly — always use this script so preflight
 * and post-build verification are never skipped.
 */

'use strict';

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const SKIP_PREFLIGHT = process.argv.includes('--skip-preflight');
const SKIP_INSTALL = process.argv.includes('--skip-install');
const TARGET_FLAG = process.argv.find(a => a.startsWith('--target='));
const TARGET = TARGET_FLAG ? TARGET_FLAG.split('=')[1] : null;

const startTime = Date.now();
let stage = '';

function elapsed() {
  return ((Date.now() - startTime) / 1000).toFixed(0) + 's';
}

function run(label, cmd, args, timeoutMs = 600000) {
  stage = label;
  console.log(`\n  [${'═'.repeat(50)}]`);
  console.log(`  STAGE: ${label}`);
  console.log(`  [${'═'.repeat(50)}]\n`);

  const r = spawnSync(cmd, args, {
    cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, stdio: 'inherit',
  });

  if (r.status !== 0) {
    console.log(`\n  ❌ STAGE FAILED: ${label}`);
    console.log(`  Build pipeline stopped at: ${label}`);
    console.log(`  Elapsed: ${elapsed()}\n`);
    process.exit(1);
  }

  console.log(`\n  ✅ ${label} — complete`);
  return r;
}

console.log('\n' + '═'.repeat(60));
console.log('  SEMBLANCE BUILD PIPELINE');
console.log('  ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
if (TARGET) console.log(`  Target: ${TARGET}`);
console.log('═'.repeat(60));

// ── Stage 1: Preflight gate ───────────────────────────────────────────────
if (!SKIP_PREFLIGHT) {
  run('PREFLIGHT GATE', 'node', ['scripts/preflight.js'], 360000);
} else {
  console.log('\n  [PREFLIGHT SKIPPED — --skip-preflight flag]');
}

// ── Stage 2: Bundle sidecar ───────────────────────────────────────────────
run('BUNDLE SIDECAR', 'node', ['scripts/bundle-sidecar.js'], 120000);

// ── Stage 3: Tauri build ──────────────────────────────────────────────────
const tauriArgs = ['tauri', 'build'];
if (TARGET === 'windows') tauriArgs.push('--target', 'x86_64-pc-windows-msvc');
if (TARGET === 'macos') tauriArgs.push('--target', 'universal-apple-darwin');
if (TARGET === 'macos-x64') tauriArgs.push('--target', 'x86_64-apple-darwin');
if (TARGET === 'macos-arm') tauriArgs.push('--target', 'aarch64-apple-darwin');

run('TAURI BUILD', 'npx', tauriArgs, 1800000); // 30 min timeout for Rust compile

// ── Stage 4: Post-install verification ───────────────────────────────────
if (!SKIP_INSTALL) {
  run('INSTALL VERIFY', 'node', ['scripts/install-and-verify.js', '--no-install'], 120000);
} else {
  console.log('\n  [INSTALL VERIFY SKIPPED — --skip-install flag]');
}

// ── Summary ───────────────────────────────────────────────────────────────
const totalTime = elapsed();
console.log('\n' + '═'.repeat(60));
console.log('  ✅ BUILD PIPELINE COMPLETE');
console.log(`  Total time: ${totalTime}`);
console.log('  Artifacts: packages/desktop/src-tauri/target/release/bundle/');
console.log('═'.repeat(60) + '\n');
process.exit(0);
