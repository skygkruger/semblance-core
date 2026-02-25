/**
 * Launch Readiness Verification — Step 32 Launch Preparation
 *
 * Cross-cutting validation: docs reference correct domain, privacy claims
 * match audit capability, feature list matches codebase, test count threshold.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// Helper: recursively find all test files
function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

describe('Launch Readiness — Step 32', () => {
  it('all documentation files reference semblance.run domain', () => {
    const docsToCheck = [
      join(ROOT, 'README.md'),
      join(ROOT, 'docs', 'PRIVACY.md'),
      join(ROOT, 'docs', 'website', 'index.html'),
      join(ROOT, 'docs', 'press-kit', 'press-release.md'),
    ];

    for (const doc of docsToCheck) {
      expect(existsSync(doc)).toBe(true);
      const content = readFileSync(doc, 'utf-8');
      expect(content).toContain('semblance.run');
    }
  });

  it('privacy claims in README match audit capability', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf-8');
    // README mentions privacy audit
    expect(readme).toContain('privacy-audit');

    // The audit script actually exists
    expect(existsSync(join(ROOT, 'scripts', 'privacy-audit', 'index.js'))).toBe(true);
  });

  it('feature list in landing page matches codebase', () => {
    const landing = readFileSync(join(ROOT, 'docs', 'website', 'index.html'), 'utf-8');

    // Landing page mentions key features
    expect(landing).toContain('Knowledge Graph');
    expect(landing).toContain('Living Will');
    expect(landing).toContain('Alter Ego');

    // Corresponding core directories/files exist
    expect(existsSync(join(ROOT, 'packages', 'core', 'knowledge'))).toBe(true);
    expect(existsSync(join(ROOT, 'packages', 'core', 'agent'))).toBe(true);
  });

  it('test count >= 3370 (baseline 3326 + 50 launch tests)', () => {
    const testFiles = findTestFiles(join(ROOT, 'tests'));

    let totalTests = 0;
    for (const file of testFiles) {
      const content = readFileSync(file, 'utf-8');
      // Count it( occurrences as test cases
      const matches = content.match(/\bit\s*\(/g);
      if (matches) {
        totalTests += matches.length;
      }
    }

    // Baseline: 3,326 pre-existing tests + 50 Step 32 launch tests = 3,376
    expect(totalTests).toBeGreaterThanOrEqual(3370);
  });
});
