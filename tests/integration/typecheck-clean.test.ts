// TypeScript Clean Slate — Verifies all packages compile with zero errors.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

function typecheck(packagePath: string): { success: boolean; output: string } {
  try {
    const tsconfig = join(ROOT, packagePath, 'tsconfig.json');
    execSync(`npx tsc --noEmit -p "${tsconfig}"`, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 60_000,
    });
    return { success: true, output: '' };
  } catch (err) {
    const output = (err as { stdout?: string; stderr?: string }).stdout ?? '';
    return { success: false, output };
  }
}

describe('TypeScript clean slate', () => {
  it('packages/core compiles with zero errors', () => {
    const result = typecheck('packages/core');
    expect(result.success, `Core TypeScript errors:\n${result.output}`).toBe(true);
  });

  it('packages/gateway compiles with zero errors', () => {
    const result = typecheck('packages/gateway');
    expect(result.success, `Gateway TypeScript errors:\n${result.output}`).toBe(true);
  });

  it('packages/semblance-ui compiles with zero errors', () => {
    const result = typecheck('packages/semblance-ui');
    expect(result.success, `UI TypeScript errors:\n${result.output}`).toBe(true);
  });

  it('packages/desktop compiles with zero errors', () => {
    const result = typecheck('packages/desktop');
    expect(result.success, `Desktop TypeScript errors:\n${result.output}`).toBe(true);
  });
});
