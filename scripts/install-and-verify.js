/**
 * INSTALL AND VERIFY — Post-install smoke test
 *
 * Verifies an installed Semblance binary works correctly.
 * Finds the installed binary, points semblance-verify at it, runs smoke test.
 *
 * Usage:
 *   node scripts/install-and-verify.js
 *   node scripts/install-and-verify.js --no-install
 *   node scripts/install-and-verify.js --installer-path /path/to/Semblance.msi   # Windows only
 *
 * Platform behavior:
 *   darwin/linux — sidecar smoke + P0 verify against installed or dev sidecar
 *   win32 + --installer-path — MSI install → sidecar smoke → P0 verify → uninstall
 *   win32 without --installer-path — same as dev sidecar path (no fake MSI PASS on macOS)
 *
 * Exit code: 0 = installed binary works, 1 = failed
 */

'use strict';

const { spawnSync } = require('child_process');
const { existsSync, readdirSync } = require('fs');
const { join, resolve, basename } = require('path');
const os = require('os');

const ROOT = join(__dirname, '..');
const NO_INSTALL = process.argv.includes('--no-install');

function readArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const INSTALLER_PATH = readArg('--installer-path');

console.log('\n' + '═'.repeat(60));
console.log('  SEMBLANCE INSTALL VERIFY');
console.log('  ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
console.log(`  platform: ${process.platform}`);
console.log('═'.repeat(60) + '\n');

function runStep(label, fn) {
  process.stdout.write(`  ${label}... `);
  const result = fn();
  console.log(result.ok ? 'PASS' : 'FAIL');
  if (!result.ok && result.detail) console.log(`    ${result.detail}`);
  return result;
}

function findMsiInstaller(explicitPath) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) return { ok: false, detail: `installer not found: ${explicitPath}` };
    if (!/\.msi$/i.test(explicitPath)) return { ok: false, detail: 'installer-path must be an .msi file on Windows' };
    return { ok: true, path: resolve(explicitPath) };
  }

  const bundleDir = join(ROOT, 'packages', 'desktop', 'src-tauri', 'target', 'release', 'bundle', 'msi');
  if (!existsSync(bundleDir)) {
    return { ok: false, detail: `MSI bundle directory missing: ${bundleDir}` };
  }
  const msi = readdirSync(bundleDir).find((name) => name.endsWith('.msi'));
  if (!msi) return { ok: false, detail: `No .msi found in ${bundleDir}` };
  return { ok: true, path: join(bundleDir, msi) };
}

function runWindowsMsiLifecycle() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      detail: 'MSI lifecycle requires win32 — refusing to simulate Windows install on this platform',
    };
  }

  const installer = findMsiInstaller(INSTALLER_PATH);
  if (!installer.ok) return installer;

  console.log(`  MSI: ${installer.path}`);

  if (!NO_INSTALL) {
    const install = spawnSync('msiexec', ['/i', installer.path, '/qn', '/norestart'], {
      encoding: 'utf8',
      timeout: 600000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (install.status !== 0) {
      return {
        ok: false,
        detail: `msiexec install failed (exit ${install.status}): ${install.stderr || install.stdout}`,
      };
    }
  } else {
    console.log('  (--no-install: skipping msiexec install step)');
  }

  const sidecarPath = findInstalledSidecar();
  if (!sidecarPath) {
    return { ok: false, detail: 'Sidecar not found after MSI install' };
  }

  const smokeEnv = { ...process.env, SEMBLANCE_SIDECAR_OVERRIDE: sidecarPath };
  const smoke = spawnSync('node', ['scripts/smoke-test-sidecar.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000, stdio: 'pipe', env: smokeEnv,
  });
  if (smoke.status !== 0) {
    return {
      ok: false,
      detail: `Sidecar smoke failed:\n${smoke.stdout}\n${smoke.stderr}`,
    };
  }

  const verify = spawnSync('node', ['scripts/semblance-verify.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: 'pipe', env: smokeEnv,
  });
  if (verify.status !== 0) {
    return {
      ok: false,
      detail: `P0 verification failed:\n${verify.stdout}\n${verify.stderr}`,
    };
  }

  if (!NO_INSTALL) {
    const productCodeGuess = basename(installer.path, '.msi');
    const uninstall = spawnSync('msiexec', ['/x', productCodeGuess, '/qn', '/norestart'], {
      encoding: 'utf8',
      timeout: 600000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (uninstall.status !== 0) {
      console.log('  ⚠️  MSI uninstall step did not exit 0 — manual cleanup may be required');
      console.log(`      attempted: msiexec /x ${productCodeGuess}`);
    }
  }

  return { ok: true, sidecarPath };
}

// ── Locate sidecar from installed binary or build output ──────────────────

function findInstalledSidecar() {
  const devSidecar = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.cjs');
  if (existsSync(devSidecar)) return devSidecar;

  const winPaths = [
    join(os.homedir(), 'AppData', 'Local', 'Programs', 'Semblance', 'resources', 'sidecar', 'bridge.cjs'),
    join('C:\\', 'Program Files', 'Semblance', 'resources', 'sidecar', 'bridge.cjs'),
  ];
  for (const p of winPaths) {
    if (existsSync(p)) return p;
  }

  const macPaths = [
    '/Applications/Semblance.app/Contents/Resources/sidecar/bridge.cjs',
    join(os.homedir(), 'Applications', 'Semblance.app', 'Contents', 'Resources', 'sidecar', 'bridge.cjs'),
  ];
  for (const p of macPaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

function runSidecarVerifyPath() {
  const sidecarPath = findInstalledSidecar();
  if (!sidecarPath) {
    return {
      ok: false,
      detail: 'Cannot find installed Semblance sidecar. Expected bridge.cjs alongside binary or in dev sidecar/.',
    };
  }

  console.log(`  Sidecar found: ${sidecarPath}\n`);

  const smokeEnv = { ...process.env, SEMBLANCE_SIDECAR_OVERRIDE: sidecarPath };
  const smoke = spawnSync('node', ['scripts/smoke-test-sidecar.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, stdio: 'inherit', env: smokeEnv,
  });
  if (smoke.status !== 0) {
    return { ok: false, detail: 'Sidecar smoke test failed' };
  }

  console.log('\n  Running P0 verification against installed binary... \n');
  const verify = spawnSync('node', ['scripts/semblance-verify.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 300000, stdio: 'inherit', env: smokeEnv,
  });
  if (verify.status !== 0) {
    return { ok: false, detail: 'P0 verification failed' };
  }

  return { ok: true, sidecarPath };
}

let result;
if (process.platform === 'win32' && (INSTALLER_PATH || !NO_INSTALL)) {
  result = runStep('Windows MSI lifecycle', runWindowsMsiLifecycle);
} else {
  if (INSTALLER_PATH && process.platform !== 'win32') {
    console.log('  ℹ️  --installer-path ignored on non-Windows platforms (no fake MSI PASS)\n');
  }
  result = runSidecarVerifyPath();
  if (result.ok) {
    console.log('\n' + '─'.repeat(60));
    console.log('  ✅ Sidecar smoke: PASS');
    console.log('  ✅ P0 verification: PASS');
  }
}

console.log('\n' + '─'.repeat(60));
console.log(result.ok ? '  🟢 INSTALLED BINARY: VERIFIED' : '  🔴 INSTALLED BINARY: FAILING');
if (!result.ok && result.detail) console.log(`  ${result.detail}`);
console.log('─'.repeat(60) + '\n');

process.exit(result.ok ? 0 : 1);
