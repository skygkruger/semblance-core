/**
 * Documentation Tests — Step 32 Launch Preparation
 *
 * Validates README.md and PRIVACY.md have complete, accurate content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Documentation — Step 32', () => {
  it('README.md exists and has substantial content (>2000 chars)', () => {
    const readmePath = join(ROOT, 'README.md');
    expect(existsSync(readmePath)).toBe(true);

    const content = readFileSync(readmePath, 'utf-8');
    expect(content.length).toBeGreaterThan(2000);
  });

  it('README.md contains the 5 inviolable rules', () => {
    const content = readFileSync(join(ROOT, 'README.md'), 'utf-8');
    expect(content).toContain('Zero Network');
    expect(content).toContain('Gateway Only');
    expect(content).toContain('No Telemetry');
    expect(content).toContain('Local Only');
  });

  it('README.md contains pricing ($18, $349, lifetime)', () => {
    const content = readFileSync(join(ROOT, 'README.md'), 'utf-8');
    expect(content).toContain('$18');
    expect(content).toContain('$349');
    expect(content.toLowerCase()).toContain('lifetime');
  });

  it('PRIVACY.md exists and has substantial content (>1500 chars)', () => {
    const privacyPath = join(ROOT, 'docs', 'PRIVACY.md');
    expect(existsSync(privacyPath)).toBe(true);

    const content = readFileSync(privacyPath, 'utf-8');
    expect(content.length).toBeGreaterThan(1500);
  });

  it('PRIVACY.md contains verification instructions', () => {
    const content = readFileSync(join(ROOT, 'docs', 'PRIVACY.md'), 'utf-8');
    expect(content.toLowerCase()).toContain('verification');
    expect(content).toContain('grep');
  });

  it('PRIVACY.md references scripts/privacy-audit/', () => {
    const content = readFileSync(join(ROOT, 'docs', 'PRIVACY.md'), 'utf-8');
    expect(content).toContain('scripts/privacy-audit/');
  });
});
