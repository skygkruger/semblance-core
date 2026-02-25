/**
 * Community & Contributor Tests — Step 32 Launch Preparation
 *
 * Validates CONTRIBUTING.md and GitHub templates exist with required content.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Community & Contributor Files — Step 32', () => {
  it('CONTRIBUTING.md exists and contains development setup', () => {
    const path = join(ROOT, 'CONTRIBUTING.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.toLowerCase()).toContain('development setup');
    expect(content).toContain('pnpm install');
  });

  it('bug report template exists', () => {
    const path = join(ROOT, '.github', 'ISSUE_TEMPLATE', 'bug_report.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.toLowerCase()).toContain('bug');
  });

  it('feature request template exists', () => {
    const path = join(ROOT, '.github', 'ISSUE_TEMPLATE', 'feature_request.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content.toLowerCase()).toContain('feature');
  });

  it('PR template includes privacy audit checklist item', () => {
    const path = join(ROOT, '.github', 'PULL_REQUEST_TEMPLATE.md');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('privacy');
    expect(content).toContain('audit');
  });
});
