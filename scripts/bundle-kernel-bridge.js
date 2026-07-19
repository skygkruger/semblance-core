#!/usr/bin/env node
// Bundle kernel-bridge.ts into production-ready kernel-bridge.cjs for Tauri spawn.

const { execSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const TRACKED_BUNDLE = join(SIDECAR_DIR, 'kernel-bridge.cjs');
const CHECK_ONLY = process.argv.includes('--check');
const checkDir = CHECK_ONLY ? mkdtempSync(join(tmpdir(), 'semblance-kernel-bridge-check-')) : null;
const outputPath = checkDir ? join(checkDir, 'kernel-bridge.cjs') : TRACKED_BUNDLE;

console.log(`[bundle-kernel-bridge] ${CHECK_ONLY ? 'Checking' : 'Bundling'} kernel-bridge.ts → kernel-bridge.cjs...`);

execSync(
  [
    join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.CMD' : 'esbuild'),
    join(SIDECAR_DIR, 'kernel-bridge.ts'),
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${outputPath}`,
    `--inject:${join(ROOT, 'scripts', 'esbuild-import-meta-url-shim.js')}`,
    '--define:import.meta.url=import_meta_url',
  ].join(' '),
  { cwd: ROOT, stdio: 'inherit' },
);

if (CHECK_ONLY) {
  try {
    if (!existsSync(TRACKED_BUNDLE)) {
      throw new Error('Tracked kernel-bridge.cjs is missing; run node scripts/bundle-kernel-bridge.js');
    }
    const expected = readFileSync(outputPath);
    const tracked = readFileSync(TRACKED_BUNDLE);
    if (!expected.equals(tracked)) {
      throw new Error(
        'Tracked kernel-bridge.cjs is stale; run node scripts/bundle-kernel-bridge.js and commit it',
      );
    }
    const bundleText = tracked.toString('utf8');
    if (!bundleText.includes('KERNEL_READY')) {
      throw new Error('Tracked kernel-bridge.cjs is missing KERNEL_READY handshake');
    }
    console.log('[bundle-kernel-bridge] PASS: tracked bundle is current');
  } finally {
    rmSync(checkDir, { recursive: true, force: true });
  }
  process.exit(0);
}

console.log('[bundle-kernel-bridge] Done.');
