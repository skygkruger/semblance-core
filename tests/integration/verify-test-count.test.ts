// Verification Script Tests — Ensure CI script exists and has correct logic.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const scriptPath = path.resolve(__dirname, '../../scripts/ci/verify-test-count.js');
const planPath = path.resolve(__dirname, '../../docs/MOBILE_VERIFICATION_PLAN.md');

describe('verify-test-count.js', () => {
  it('script exists and is readable', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('script parses JSON reporter output', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // Verify it uses vitest JSON reporter
    expect(content).toContain('--reporter=json');
    expect(content).toContain('--outputFile=');
    // Verify it reads and parses JSON
    expect(content).toContain('JSON.parse');
  });

  it('script checks against floor and rejects below', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // Verify floor comparison logic exists
    expect(content).toContain('totalTests < floor');
    expect(content).toContain('process.exit(1)');
    // Verify default floor
    expect(content).toContain('2690');
  });

  it('script passes when count meets floor', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    // Verify success path exists
    expect(content).toContain('PASS');
    expect(content).toContain('process.exit(0)');
  });
});

describe('MOBILE_VERIFICATION_PLAN.md', () => {
  it('document exists', () => {
    expect(fs.existsSync(planPath)).toBe(true);
    const content = fs.readFileSync(planPath, 'utf-8');
    expect(content).toContain('Mobile Verification Plan');
    expect(content).toContain('iOS Verification Steps');
    expect(content).toContain('Android Verification Steps');
  });
});
