#!/usr/bin/env node
// Bundle runtime-core-bridge.ts into production-ready runtime-core-bridge.cjs.

const { execSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const TRACKED_BUNDLE = join(SIDECAR_DIR, 'runtime-core-bridge.cjs');
const CHECK_ONLY = process.argv.includes('--check');
const checkDir = CHECK_ONLY ? mkdtempSync(join(tmpdir(), 'semblance-runtime-core-check-')) : null;
const outputPath = checkDir ? join(checkDir, 'runtime-core-bridge.cjs') : TRACKED_BUNDLE;

console.log(`[bundle-runtime-core] ${CHECK_ONLY ? 'Checking' : 'Bundling'} runtime-core-bridge.ts → runtime-core-bridge.cjs...`);

execSync(
  [
    join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.CMD' : 'esbuild'),
    join(SIDECAR_DIR, 'runtime-core-bridge.ts'),
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${outputPath}`,
    `--inject:${join(ROOT, 'scripts', 'esbuild-import-meta-url-shim.js')}`,
    '--define:import.meta.url=import_meta_url',
    '--external:better-sqlite3',
    '--external:@lancedb/lancedb',
    '--external:@lancedb/lancedb-win32-x64-msvc',
    '--external:apache-arrow',
  ].join(' '),
  { cwd: ROOT, stdio: 'inherit' },
);

if (CHECK_ONLY) {
  try {
    if (!existsSync(TRACKED_BUNDLE)) {
      throw new Error('Tracked runtime-core-bridge.cjs is missing; run node scripts/bundle-runtime-core.js');
    }
    const expected = readFileSync(outputPath);
    const tracked = readFileSync(TRACKED_BUNDLE);
    if (!expected.equals(tracked)) {
      throw new Error(
        'Tracked runtime-core-bridge.cjs is stale; run node scripts/bundle-runtime-core.js and commit it',
      );
    }
    const bundleText = tracked.toString('utf8');
    if (!bundleText.includes('CORE_READY')) {
      throw new Error('Tracked runtime-core-bridge.cjs is missing CORE_READY handshake');
    }
    console.log('[bundle-runtime-core] PASS: tracked bundle is current');
  } finally {
    rmSync(checkDir, { recursive: true, force: true });
  }
  process.exit(0);
}

console.log('[bundle-runtime-core] Done.');
