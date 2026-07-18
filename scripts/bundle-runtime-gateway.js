#!/usr/bin/env node
// Bundle runtime-gateway-bridge.ts into production-ready runtime-gateway-bridge.cjs.

const { execSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const TRACKED_BUNDLE = join(SIDECAR_DIR, 'runtime-gateway-bridge.cjs');
const CHECK_ONLY = process.argv.includes('--check');
const checkDir = CHECK_ONLY ? mkdtempSync(join(tmpdir(), 'semblance-runtime-gateway-check-')) : null;
const outputPath = checkDir ? join(checkDir, 'runtime-gateway-bridge.cjs') : TRACKED_BUNDLE;

console.log(`[bundle-runtime-gateway] ${CHECK_ONLY ? 'Checking' : 'Bundling'} runtime-gateway-bridge.ts → runtime-gateway-bridge.cjs...`);

execSync(
  [
    join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.CMD' : 'esbuild'),
    join(SIDECAR_DIR, 'runtime-gateway-bridge.ts'),
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
      throw new Error('Tracked runtime-gateway-bridge.cjs is missing; run node scripts/bundle-runtime-gateway.js');
    }
    const expected = readFileSync(outputPath);
    const tracked = readFileSync(TRACKED_BUNDLE);
    if (!expected.equals(tracked)) {
      throw new Error(
        'Tracked runtime-gateway-bridge.cjs is stale; run node scripts/bundle-runtime-gateway.js and commit it',
      );
    }
    const bundleText = tracked.toString('utf8');
    if (!bundleText.includes('GATEWAY_READY')) {
      throw new Error('Tracked runtime-gateway-bridge.cjs is missing GATEWAY_READY handshake');
    }
    console.log('[bundle-runtime-gateway] PASS: tracked bundle is current');
  } finally {
    rmSync(checkDir, { recursive: true, force: true });
  }
  process.exit(0);
}

console.log('[bundle-runtime-gateway] Done.');
