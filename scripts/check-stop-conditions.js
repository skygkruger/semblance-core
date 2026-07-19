#!/usr/bin/env node
'use strict';

/**
 * Program stop-condition checker (§19).
 *
 * Fails closed on detectable violations:
 * - Non-Gateway packages importing banned network modules
 * - extension-sdk exporting raw Vault/Gateway/OS handles
 * - commerce.newSalesEnabled without slice 7 in completedSlices
 * - release-manifest missing repository pins
 *
 * Usage:
 *   node scripts/check-stop-conditions.js
 *   node scripts/check-stop-conditions.js --manifest release/release-manifest.json
 */

const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = join(__dirname, '..');

const NON_GATEWAY_PACKAGES = [
  'packages/core',
  'packages/kernel',
  'packages/vault',
  'packages/proof',
  'packages/runtime-core',
  'packages/runtime-model',
  'packages/runtime-shared',
  'packages/cloud-broker',
  'packages/extension-sdk',
  'packages/extension-runner',
  'packages/sync',
];

const NETWORK_PATTERNS = [
  /\bimport\b.*['"](?:node:)?(?:http|https|dgram|dns|tls)['"]/,
  /\brequire\s*\(\s*['"](?:node:)?(?:http|https|dgram|dns|tls)['"]\s*\)/,
  /\bimport\b.*['"](?:axios|got|node-fetch|undici|superagent|socket\.io|ws)['"]/,
  /\brequire\s*\(\s*['"](?:axios|got|node-fetch|undici|superagent|socket\.io|ws)['"]\s*\)/,
  /\bfetch\s*\(/,
  /\bnew\s+WebSocket\b/,
];

const LOCAL_IPC_NET_PATHS = [
  'packages/core/agent/ipc-client.ts',
  'packages/core/ipc/',
  'packages/kernel/src/ipc/',
  'packages/kernel/tests/',
  'packages/runtime-shared/src/ipc-client.ts',
  'packages/runtime-shared/tests/',
];

const APPROVED_EXCEPTIONS = [
  { packagePrefix: 'packages/core/agent/', file: 'ipc-client.ts', reason: 'local IPC only' },
  { packagePrefix: 'packages/core/llm/', reason: 'ollama localhost client' },
];

function parseArgs(argv) {
  let manifestPath = join(ROOT, 'release', 'release-manifest.json');
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      manifestPath = resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return manifestPath;
}

function walkFiles(dir, files = []) {
  if (!statSync(dir).isDirectory()) return files;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkFiles(full, files);
    else if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry)) files.push(full);
  }
  return files;
}

function isTestOrAdversarialPath(relPath) {
  if (relPath.includes('/tests/')) return true;
  if (relPath.endsWith('.test.ts') || relPath.endsWith('.test.js')) return true;
  if (
    relPath === 'packages/extension-runner/src/sandbox.ts'
    || relPath === 'packages/extension-runner/src/sandbox.js'
  ) {
    return true;
  }
  return false;
}

function isApprovedException(relPath) {
  if (isTestOrAdversarialPath(relPath)) return true;
  for (const prefix of LOCAL_IPC_NET_PATHS) {
    if (relPath.startsWith(prefix) || relPath === prefix) return true;
  }
  for (const exception of APPROVED_EXCEPTIONS) {
    if (!relPath.startsWith(exception.packagePrefix)) continue;
    if (exception.file && !relPath.endsWith(exception.file)) continue;
    if (exception.packagePrefix === 'packages/core/llm/' && !/\bollama\b/.test(relPath)) {
      // ollama import allowed anywhere under llm/
      return true;
    }
    if (exception.file && relPath.endsWith(exception.file)) return true;
    if (!exception.file) return true;
  }
  if (relPath.startsWith('packages/core/llm/')) return true;
  return false;
}

function scanNetworkImports() {
  const violations = [];
  for (const pkg of NON_GATEWAY_PACKAGES) {
    const abs = join(ROOT, pkg);
    for (const file of walkFiles(abs)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (isApprovedException(rel)) continue;
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
        if (/\b(?:node:)?net['"]/.test(line) && isApprovedException(rel)) continue;
        for (const pattern of NETWORK_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${rel}:${lineIndex + 1}: ${line.trim()}`);
            break;
          }
        }
      }
    }
  }
  return violations;
}

function checkExtensionSdkSurface() {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', 'packages/extension-sdk/tests/no-raw-handles.test.ts'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 },
  );
  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
  };
}

function checkCommerceSales(manifest) {
  const salesEnabled = manifest.commerce?.newSalesEnabled === true;
  const slice7Complete = Array.isArray(manifest.completedSlices)
    && manifest.completedSlices.includes(7);
  if (salesEnabled && !slice7Complete) {
    return 'commerce.newSalesEnabled is true but completedSlices does not include 7';
  }
  return null;
}

function checkRepositoryPins(manifest) {
  const errors = [];
  for (const name of ['core', 'representative', 'website']) {
    const repo = manifest.repositories?.[name];
    if (!repo?.sourceCommit || !repo?.sourceTreeHash) {
      errors.push(`repositories.${name} missing sourceCommit or sourceTreeHash pin`);
    }
  }
  return errors;
}

/**
 * @param {object} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkStopConditions(manifest) {
  const errors = [];

  const networkViolations = scanNetworkImports();
  if (networkViolations.length > 0) {
    errors.push(
      `Non-Gateway network imports detected (${networkViolations.length}): `
      + networkViolations.slice(0, 5).join('; '),
    );
  }

  const sdk = checkExtensionSdkSurface();
  if (!sdk.ok) {
    errors.push('extension-sdk raw handle surface check failed');
  }

  const commerceError = checkCommerceSales(manifest);
  if (commerceError) errors.push(commerceError);

  errors.push(...checkRepositoryPins(manifest));

  return { valid: errors.length === 0, errors, sdkOutput: sdk.output };
}

function main() {
  const manifestPath = parseArgs(process.argv);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (cause) {
    console.error(`STOP_CONDITION_READ_FAILED: ${cause.message}`);
    return 1;
  }

  const result = checkStopConditions(manifest);
  console.log('Program stop conditions');
  console.log('─'.repeat(60));

  if (result.valid) {
    console.log('  PASS  no detectable stop-condition violations');
    console.log('─'.repeat(60));
    return 0;
  }

  for (const error of result.errors) {
    console.error(`  FAIL  ${error}`);
  }
  if (result.sdkOutput) {
    console.error(result.sdkOutput.split('\n').slice(-8).join('\n'));
  }
  console.error('─'.repeat(60));
  console.error(`Stop conditions: FAIL (${result.errors.length} violation(s))`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  checkStopConditions,
  scanNetworkImports,
  NON_GATEWAY_PACKAGES,
};
