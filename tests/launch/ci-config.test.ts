/**
 * CI/CD Configuration Tests — Step 32 Launch Preparation
 *
 * Validates GitHub Actions workflows and templates exist with correct structure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');

describe('CI/CD Configuration — Step 32', () => {
  it('CI workflow exists and has valid structure (name:, on:, jobs:)', () => {
    const ciPath = join(WORKFLOWS, 'ci.yml');
    expect(existsSync(ciPath)).toBe(true);

    const content = readFileSync(ciPath, 'utf-8');
    expect(content).toMatch(/^name:/m);
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/^jobs:/m);
  });

  it('privacy audit workflow exists and has valid structure', () => {
    const auditPath = join(WORKFLOWS, 'privacy-audit.yml');
    expect(existsSync(auditPath)).toBe(true);

    const content = readFileSync(auditPath, 'utf-8');
    expect(content).toMatch(/^name:/m);
    expect(content).toMatch(/^on:/m);
    expect(content).toMatch(/^jobs:/m);
  });

  it('release workflow exists with tag trigger', () => {
    const releasePath = join(WORKFLOWS, 'release.yml');
    expect(existsSync(releasePath)).toBe(true);

    const content = readFileSync(releasePath, 'utf-8');
    expect(content).toContain('tags:');
    expect(content).toMatch(/v\*/);
  });

  it('CI includes TypeScript check step (tsc --noEmit)', () => {
    const content = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf-8');
    expect(content).toContain('tsc --noEmit');
  });

  it('CI includes test run step (vitest run)', () => {
    const content = readFileSync(join(WORKFLOWS, 'ci.yml'), 'utf-8');
    expect(content).toContain('vitest run');
  });

  it('privacy audit workflow references privacy-audit script', () => {
    const content = readFileSync(join(WORKFLOWS, 'privacy-audit.yml'), 'utf-8');
    expect(content).toContain('scripts/privacy-audit/');
  });
});
