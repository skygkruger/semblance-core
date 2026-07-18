#!/usr/bin/env node
'use strict';

/**
 * Bundle the current Node.js executable for the active platform triple.
 * Production Tauri builds spawn this binary instead of relying on system Node.
 *
 * Usage:
 *   node scripts/bundle-runtimes.js
 *   node scripts/bundle-runtimes.js --check
 */

const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '..');
const RUNTIMES_ROOT = join(ROOT, 'packages', 'desktop', 'src-tauri', 'runtimes');
const CHECK_ONLY = process.argv.includes('--check');

function detectPlatformTriple() {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    if (arch === 'arm64') return 'darwin-arm64';
    if (arch === 'x64') return 'darwin-x64';
    throw new Error(`Unsupported macOS architecture: ${arch}`);
  }
  if (platform === 'linux') {
    if (arch === 'x64') return 'linux-x64';
    throw new Error(`Unsupported Linux architecture: ${arch}`);
  }
  if (platform === 'win32') {
    if (arch === 'x64') return 'win32-x64';
    throw new Error(`Unsupported Windows architecture: ${arch}`);
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function nodeBinaryName() {
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

function copyNodeBinary(sourceNode, binaryPath) {
  if (existsSync(binaryPath)) {
    rmSync(binaryPath);
  }
  if (process.platform === 'darwin') {
    execFileSync('cp', ['-X', sourceNode, binaryPath], { stdio: 'inherit' });
  } else {
    copyFileSync(sourceNode, binaryPath);
  }
  chmodSync(binaryPath, 0o755);
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readManifest(platformDir) {
  const manifestPath = join(platformDir, 'runtime-manifest.json');
  if (!existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function verifyPlatformBundle(platform) {
  const platformDir = join(RUNTIMES_ROOT, platform);
  const manifest = readManifest(platformDir);
  if (!manifest) {
    throw new Error(
      `Missing runtime-manifest.json for ${platform}; run node scripts/bundle-runtimes.js`,
    );
  }

  const binaryRelativePath = manifest.binaryRelativePath || nodeBinaryName();
  const binaryPath = join(platformDir, binaryRelativePath);
  if (!existsSync(binaryPath)) {
    throw new Error(
      `Bundled Node binary missing at ${binaryPath}; run node scripts/bundle-runtimes.js`,
    );
  }

  const actualHash = sha256File(binaryPath);
  if (manifest.sha256 !== actualHash) {
    throw new Error(
      `Bundled Node sha256 mismatch for ${platform}: expected ${manifest.sha256}, got ${actualHash}`,
    );
  }

  console.log(`[bundle-runtimes] OK ${platform} node=${process.version} sha256=${actualHash}`);
  return { platform, manifest, binaryPath, sha256: actualHash };
}

function bundlePlatform(platform) {
  const platformDir = join(RUNTIMES_ROOT, platform);
  const binaryName = nodeBinaryName();
  const binaryPath = join(platformDir, binaryName);
  const sourceNode = realpathSync(process.execPath);

  mkdirSync(platformDir, { recursive: true });
  copyNodeBinary(sourceNode, binaryPath);

  const sha256 = sha256File(binaryPath);
  const manifest = {
    platform,
    nodeVersion: process.version,
    sha256,
    bundledAt: new Date().toISOString(),
    binaryRelativePath: binaryName,
  };

  writeFileSync(
    join(platformDir, 'runtime-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  writeFileSync(
    join(RUNTIMES_ROOT, 'active-platform.json'),
    `${JSON.stringify({
      platform,
      runtimeDir: platform,
      manifestPath: `${platform}/runtime-manifest.json`,
      nodeVersion: process.version,
      sha256,
      bundledAt: manifest.bundledAt,
    }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `[bundle-runtimes] Bundled ${sourceNode} -> ${binaryPath} (${process.version}, sha256=${sha256})`,
  );
  return manifest;
}

function main() {
  const platform = detectPlatformTriple();
  console.log(`[bundle-runtimes] Platform triple: ${platform}`);

  if (CHECK_ONLY) {
    verifyPlatformBundle(platform);
    return;
  }

  bundlePlatform(platform);
  verifyPlatformBundle(platform);
}

main();
