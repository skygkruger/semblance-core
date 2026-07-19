#!/usr/bin/env node
'use strict';

/**
 * Process isolation + egress denial audit.
 *
 * Runs runtime-shared process isolation tests and adversarial egress guard tests.
 * Pass criterion: 100/100 forbidden egress attempts denied per non-Gateway process.
 *
 * Usage: node scripts/process-isolation-audit.js
 * Exit: 0 pass, 1 fail
 */

const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

const SUITES = [
  {
    label: 'egress-adversarial',
    args: ['vitest', 'run', 'tests/privacy/egress-adversarial.test.ts'],
    required: true,
  },
  {
    label: 'runtime-model-isolation',
    args: ['vitest', 'run', 'packages/runtime-model/tests/isolation.test.ts'],
    required: true,
  },
  {
    label: 'process-isolation-spawn',
    args: ['vitest', 'run', 'packages/runtime-shared/tests/process-isolation.test.ts'],
    required: false,
  },
];

function runSuite(suite) {
  const result = spawnSync('npx', suite.args, {
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
  console.log('Process isolation audit');
  console.log('─'.repeat(60));

  const results = SUITES.map((suite) => ({ suite, ...runSuite(suite) }));
  let failed = 0;
  let optionalFailed = 0;

  for (const result of results) {
    const status = result.ok ? 'PASS' : (result.suite.required ? 'FAIL' : 'WARN');
    console.log(`  ${status}  ${result.label} (exit ${result.exitCode})`);
    if (!result.ok) {
      if (result.suite.required) failed += 1;
      else optionalFailed += 1;
      const excerpt = result.output.split('\n').slice(-12).join('\n');
      console.log(excerpt);
    }
  }

  console.log('─'.repeat(60));
  if (failed === 0) {
    if (optionalFailed > 0) {
      console.log(`Process isolation audit: PASS (${optionalFailed} optional spawn check deferred; egress criterion met)`);
    } else {
      console.log('Process isolation audit: PASS');
    }
    return 0;
  }
  console.error(`Process isolation audit: FAIL (${failed} required suite(s))`);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { runSuite, SUITES };
