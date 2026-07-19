/**
 * Guard: cloud-broker must not import network primitives.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT, 'src');

const BANNED_PATTERNS = [
  /\bfrom\s+['"]node:fetch['"]/,
  /\bfrom\s+['"]node:http['"]/,
  /\bfrom\s+['"]node:https['"]/,
  /\bfrom\s+['"]node:net['"]/,
  /\bfrom\s+['"]undici['"]/,
  /\brequire\s*\(\s*['"]node:http['"]\s*\)/,
  /\brequire\s*\(\s*['"]node:https['"]\s*\)/,
  /\brequire\s*\(\s*['"]node:net['"]\s*\)/,
  /\brequire\s*\(\s*['"]undici['"]\s*\)/,
  /\bfetch\s*\(/,
];

function collectTsFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectTsFiles(fullPath, baseDir));
    } else if (entry.endsWith('.ts')) {
      files.push(relative(baseDir, fullPath));
    }
  }
  return files;
}

describe('cloud-broker network import ban', () => {
  it('has no fetch/http/https/net/undici imports in source', () => {
    const violations: string[] = [];

    for (const file of collectTsFiles(SRC_DIR, SRC_DIR)) {
      const content = readFileSync(join(SRC_DIR, file), 'utf8');
      for (const pattern of BANNED_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${file}: matched ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
