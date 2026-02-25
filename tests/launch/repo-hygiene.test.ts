/**
 * Repository Hygiene Tests — Step 32 Launch Preparation
 *
 * Validates license files, package.json version, and absence of secrets.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Repository Hygiene — Step 32', () => {
  it('LICENSE exists with dual license notice (contains "MIT" and "Apache")', () => {
    const path = join(ROOT, 'LICENSE');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('MIT');
    expect(content).toContain('Apache');
  });

  it('LICENSE-MIT exists with MIT text', () => {
    const path = join(ROOT, 'LICENSE-MIT');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('Permission is hereby granted');
  });

  it('LICENSE-APACHE exists with Apache 2.0 text', () => {
    const path = join(ROOT, 'LICENSE-APACHE');
    expect(existsSync(path)).toBe(true);

    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('Apache License');
    expect(content).toContain('Version 2.0');
  });

  it('root package.json version is "1.0.0"', () => {
    const pkgJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect(pkgJson.version).toBe('1.0.0');
  });

  it('no potential secret patterns in key files', () => {
    const secretPatterns = [
      /sk-ant-[a-zA-Z0-9]/,
      /api_key\s*=\s*['"]\S+['"]/i,
      /PRIVATE_KEY\s*=\s*['"]\S+['"]/i,
      /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
    ];

    const filesToCheck = [
      join(ROOT, 'README.md'),
      join(ROOT, 'docs', 'PRIVACY.md'),
      join(ROOT, 'docs', 'website', 'index.html'),
      join(ROOT, 'package.json'),
    ];

    for (const file of filesToCheck) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf-8');
      for (const pattern of secretPatterns) {
        expect(content).not.toMatch(pattern);
      }
    }
  });
});
