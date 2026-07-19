#!/usr/bin/env node
'use strict';

/**
 * Kernel/runtime readiness smoke test.
 *
 * Verifies kernel-main readiness protocol and runtime package boot contracts.
 *
 * Usage: node scripts/smoke-test-runtimes.js
 * Exit: 0 pass, 1 fail
 */

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

const SUITES = [
  {
    label: 'kernel-main-readiness',
    args: ['vitest', 'run', 'packages/kernel/tests/kernel-main.test.ts'],
  },
  {
    label: 'bundled-runtime-check',
    command: 'node',
    args: ['scripts/bundle-runtimes.js', '--check'],
  },
];

function runSuite(suite) {
  const cmd = suite.command ?? 'npx';
  const result = spawnSync(cmd, suite.args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 180000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return {
    label: suite.label,
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output,
  };
}

function main() {
  console.log('Runtime smoke test');
  console.log('─'.repeat(60));

  const results = [];
  for (const suite of SUITES) {
    const result = runSuite(suite);
    results.push(result);
    const status = result.ok ? 'PASS' : 'FAIL';
    console.log(`  ${status}  ${result.label} (exit ${result.exitCode})`);
    if (!result.ok) {
      const excerpt = result.output.split('\n').slice(-12).join('\n');
      console.log(excerpt);
    }
  }

  const failed = results.filter((entry) => !entry.ok).length;
  console.log('─'.repeat(60));
  if (failed === 0) {
    console.log('Runtime smoke: all required processes ready');
    return 0;
  }
  console.error(`Runtime smoke: FAIL (${failed} suite(s))`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { runSuite, SUITES };
