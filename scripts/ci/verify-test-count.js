#!/usr/bin/env node
// verify-test-count.js — CI script to verify minimum test count.
// Runs vitest with JSON reporter, parses output, and exits non-zero if below floor.
//
// Usage: node scripts/ci/verify-test-count.js [--floor N]
//
// Default floor: 2690 (Sprint 3 target)

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let floor = 2690;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--floor' && args[i + 1]) {
    floor = parseInt(args[i + 1], 10);
    if (isNaN(floor)) {
      console.error('Invalid floor value:', args[i + 1]);
      process.exit(2);
    }
  }
}

const tmpDir = join(process.cwd(), '.tmp');
if (!existsSync(tmpDir)) {
  mkdirSync(tmpDir, { recursive: true });
}
const outputFile = join(tmpDir, 'vitest-results.json');

console.log(`[verify-test-count] Running vitest with JSON reporter...`);
console.log(`[verify-test-count] Minimum test floor: ${floor}`);

try {
  execSync(`npx vitest run --reporter=json --outputFile="${outputFile}"`, {
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600_000, // 10 minutes
  });
} catch (err) {
  // vitest may exit non-zero if tests fail — we still want to read the JSON
  if (!existsSync(outputFile)) {
    console.error('[verify-test-count] vitest failed and produced no JSON output.');
    console.error(err.stderr?.toString().slice(0, 500) || 'No stderr');
    process.exit(2);
  }
}

let results;
try {
  const raw = readFileSync(outputFile, 'utf-8');
  results = JSON.parse(raw);
} catch (err) {
  console.error('[verify-test-count] Failed to parse vitest JSON output:', err.message);
  process.exit(2);
}

const totalTests = results.numTotalTests ?? 0;
const passedTests = results.numPassedTests ?? 0;
const failedTests = results.numFailedTests ?? 0;
const totalSuites = results.numTotalTestSuites ?? 0;

console.log(`[verify-test-count] Results:`);
console.log(`  Total test suites: ${totalSuites}`);
console.log(`  Total tests:       ${totalTests}`);
console.log(`  Passed:            ${passedTests}`);
console.log(`  Failed:            ${failedTests}`);
console.log(`  Floor:             ${floor}`);

if (failedTests > 0) {
  console.error(`\n[verify-test-count] FAIL: ${failedTests} test(s) failed.`);
  process.exit(1);
}

if (totalTests < floor) {
  console.error(`\n[verify-test-count] FAIL: Test count ${totalTests} is below floor ${floor}.`);
  process.exit(1);
}

console.log(`\n[verify-test-count] PASS: ${totalTests} tests >= ${floor} floor, 0 failures.`);
process.exit(0);
