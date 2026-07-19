#!/usr/bin/env node
// Bundle runtime-model-bridge.ts into production-ready runtime-model-bridge.cjs.

const { execSync } = require('child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const SIDECAR_DIR = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar');
const TRACKED_BUNDLE = join(SIDECAR_DIR, 'runtime-model-bridge.cjs');
const CHECK_ONLY = process.argv.includes('--check');
const checkDir = CHECK_ONLY ? mkdtempSync(join(tmpdir(), 'semblance-runtime-model-check-')) : null;
const outputPath = checkDir ? join(checkDir, 'runtime-model-bridge.cjs') : TRACKED_BUNDLE;

console.log(`[bundle-runtime-model] ${CHECK_ONLY ? 'Checking' : 'Bundling'} runtime-model-bridge.ts → runtime-model-bridge.cjs...`);

execSync(
  [
    join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.CMD' : 'esbuild'),
    join(SIDECAR_DIR, 'runtime-model-bridge.ts'),
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
      throw new Error('Tracked runtime-model-bridge.cjs is missing; run node scripts/bundle-runtime-model.js');
    }
    const expected = readFileSync(outputPath);
    const tracked = readFileSync(TRACKED_BUNDLE);
    if (!expected.equals(tracked)) {
      throw new Error(
        'Tracked runtime-model-bridge.cjs is stale; run node scripts/bundle-runtime-model.js and commit it',
      );
    }
    const bundleText = tracked.toString('utf8');
    if (!bundleText.includes('MODEL_READY')) {
      throw new Error('Tracked runtime-model-bridge.cjs is missing MODEL_READY handshake');
    }
    console.log('[bundle-runtime-model] PASS: tracked bundle is current');
  } finally {
    rmSync(checkDir, { recursive: true, force: true });
  }
  process.exit(0);
}

console.log('[bundle-runtime-model] Done.');
