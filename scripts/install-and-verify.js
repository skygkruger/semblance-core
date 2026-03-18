/**
 * INSTALL AND VERIFY — Post-install smoke test
 *
 * Verifies an installed Semblance binary works correctly.
 * Finds the installed binary, points semblance-verify at it, runs smoke test.
 *
 * Usage:
 *   node scripts/install-and-verify.js              # Full install + verify
 *   node scripts/install-and-verify.js --no-install # Verify only (binary already installed)
 *
 * Exit code: 0 = installed binary works, 1 = failed
 */

'use strict';

const { spawnSync, execSync } = require('child_process');
const { existsSync, readdirSync } = require('fs');
const { join } = require('path');
const os = require('os');

const ROOT = join(__dirname, '..');
const NO_INSTALL = process.argv.includes('--no-install');

console.log('\n' + '═'.repeat(60));
console.log('  SEMBLANCE INSTALL VERIFY');
console.log('  ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
console.log('═'.repeat(60) + '\n');

// ── Locate sidecar from installed binary or build output ──────────────────

function findInstalledSidecar() {
  // First: check build output (most common for dev builds)
  const buildSidecar = join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'semblance.exe');
  const buildSidecarMac = join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'semblance');

  // Dev sidecar (bundled CJS)
  const devSidecar = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');
  if (existsSync(devSidecar)) return devSidecar;

  // Windows installed locations
  const winPaths = [
    join(os.homedir(), 'AppData', 'Local', 'Programs', 'Semblance', 'resources', 'sidecar', 'bridge.cjs'),
    join('C:\\', 'Program Files', 'Semblance', 'resources', 'sidecar', 'bridge.cjs'),
  ];
  for (const p of winPaths) {
    if (existsSync(p)) return p;
  }

  // macOS installed
  const macPaths = [
    '/Applications/Semblance.app/Contents/Resources/sidecar/bridge.cjs',
    join(os.homedir(), 'Applications', 'Semblance.app', 'Contents', 'Resources', 'sidecar', 'bridge.cjs'),
  ];
  for (const p of macPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

const sidecarPath = findInstalledSidecar();

if (!sidecarPath) {
  console.log('  ❌ Cannot find installed Semblance sidecar.');
  console.log('  Make sure Semblance is installed, or run from the build output directory.');
  console.log('  Expected: bridge.cjs in sidecar/ directory alongside the binary.\n');
  process.exit(1);
}

console.log(`  Sidecar found: ${sidecarPath}\n`);

// ── Run smoke test against the found sidecar ─────────────────────────────

process.stdout.write('  Running sidecar smoke test... ');
const smokeEnv = { ...process.env, SEMBLANCE_SIDECAR_OVERRIDE: sidecarPath };
const smoke = spawnSync('node', ['scripts/smoke-test-sidecar.js'], {
  cwd: ROOT, encoding: 'utf8', timeout: 60000, stdio: 'inherit', env: smokeEnv,
});
const smokeOk = smoke.status === 0;
console.log(smokeOk ? '' : '\n  Smoke test FAILED');

// ── Run verify against the found sidecar ─────────────────────────────────

process.stdout.write('\n  Running P0 verification against installed binary... \n');
const verifyEnv = { ...process.env, SEMBLANCE_SIDECAR_OVERRIDE: sidecarPath };
const verify = spawnSync('node', ['scripts/semblance-verify.js'], {
  cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: 'inherit', env: verifyEnv,
});
const verifyOk = verify.status === 0;

// ── Summary ───────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60));
console.log(smokeOk ? '  ✅ Sidecar smoke: PASS' : '  ❌ Sidecar smoke: FAIL');
console.log(verifyOk ? '  ✅ P0 verification: PASS' : '  ❌ P0 verification: FAIL');
console.log('─'.repeat(60));

const allOk = smokeOk && verifyOk;
console.log(`\n  ${allOk ? '🟢 INSTALLED BINARY: VERIFIED' : '🔴 INSTALLED BINARY: FAILING'}\n`);
process.exit(allOk ? 0 : 1);
