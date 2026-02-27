/**
 * Guard Test: No Node.js Builtins in packages/core/
 *
 * The PlatformAdapter pattern requires ALL platform-specific imports to flow
 * through packages/core/platform/. This test scans every .ts file in packages/core/
 * and fails if any file directly imports Node.js builtins or better-sqlite3.
 *
 * Approved exceptions:
 * - packages/core/platform/desktop-adapter.ts (wraps Node.js APIs)
 * - packages/core/ipc/socket-transport.ts (uses node:net for desktop IPC — approved per CLAUDE.md)
 *
 * If this test fails, a file in packages/core/ is bypassing the PlatformAdapter
 * and will crash on React Native.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_DIR = join(ROOT, 'packages', 'core');

// Files that are approved to have Node.js imports
const APPROVED_FILES = new Set([
  'platform/desktop-adapter.ts',     // The adapter itself wraps Node.js
  'platform/desktop-vector-store.ts', // LanceDB wrapper (only @lancedb/lancedb import)
  'ipc/socket-transport.ts',         // Desktop-only IPC transport (node:net approved)
  // Importers are desktop-only file parsers — they inherently require node:fs/node:crypto
  // On mobile, imports use platform-specific document picker APIs, not these parsers.
  'importers/browser/chrome-history-parser.ts',
  'importers/browser/firefox-history-parser.ts',
  'importers/notes/obsidian-parser.ts',
  'importers/notes/apple-notes-parser.ts',
  'importers/messaging/whatsapp-parser.ts',
  'importers/photos/exif-parser.ts',
  // Founding member JWT verification uses node:crypto for Ed25519 signature verification.
  // On mobile, this would use the platform CryptoAdapter (not yet supporting Ed25519 verify).
  'premium/founding-token.ts',
  // License key Ed25519 signature verification uses node:crypto for Ed25519 verify.
  // On mobile, this would use the platform CryptoAdapter (not yet supporting Ed25519 verify).
  'premium/license-keys.ts',
]);

function collectTsFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
          files.push(...collectTsFiles(fullPath, baseDir));
        } else if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files;
}

// Patterns that indicate Node.js builtins or better-sqlite3 usage
const BANNED_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /from\s+['"]node:fs['"]/,           description: "import from 'node:fs'" },
  { pattern: /from\s+['"]node:fs\/promises['"]/,  description: "import from 'node:fs/promises'" },
  { pattern: /from\s+['"]node:path['"]/,          description: "import from 'node:path'" },
  { pattern: /from\s+['"]node:os['"]/,            description: "import from 'node:os'" },
  { pattern: /from\s+['"]node:crypto['"]/,        description: "import from 'node:crypto'" },
  { pattern: /from\s+['"]node:child_process['"]/,description: "import from 'node:child_process'" },
  { pattern: /from\s+['"]fs['"]/,                 description: "import from 'fs' (bare)" },
  { pattern: /from\s+['"]path['"]/,               description: "import from 'path' (bare)" },
  { pattern: /from\s+['"]os['"]/,                 description: "import from 'os' (bare)" },
  { pattern: /from\s+['"]crypto['"]/,             description: "import from 'crypto' (bare)" },
  { pattern: /from\s+['"]better-sqlite3['"]/,     description: "import from 'better-sqlite3'" },
  { pattern: /require\s*\(\s*['"]node:/,          description: "require('node:...')" },
  { pattern: /require\s*\(\s*['"]better-sqlite3['"]/, description: "require('better-sqlite3')" },
  { pattern: /import\s*\(\s*['"]node:fs['"]\s*\)/, description: "dynamic import('node:fs')" },
  { pattern: /from\s+['"]@lancedb\/lancedb['"]/, description: "import from '@lancedb/lancedb'" },
];

describe('No Node.js Builtins in packages/core/', () => {
  const allFiles = collectTsFiles(CORE_DIR, CORE_DIR);
  const filesToScan = allFiles.filter(f => {
    const rel = relative(CORE_DIR, f).replace(/\\/g, '/');
    return !APPROVED_FILES.has(rel);
  });

  it('should find files to scan', () => {
    expect(filesToScan.length).toBeGreaterThan(0);
  });

  for (const banned of BANNED_PATTERNS) {
    it(`no files should contain ${banned.description}`, () => {
      const violations: string[] = [];

      for (const filePath of filesToScan) {
        const content = readFileSync(filePath, 'utf-8');
        if (banned.pattern.test(content)) {
          const rel = relative(CORE_DIR, filePath).replace(/\\/g, '/');
          violations.push(rel);
        }
      }

      expect(violations, `Files with ${banned.description}:\n  ${violations.join('\n  ')}`).toEqual([]);
    });
  }

  it('aggregate: zero Node.js builtins in core (excluding approved files)', () => {
    const allViolations: Array<{ file: string; pattern: string }> = [];

    for (const filePath of filesToScan) {
      const content = readFileSync(filePath, 'utf-8');
      const rel = relative(CORE_DIR, filePath).replace(/\\/g, '/');
      for (const banned of BANNED_PATTERNS) {
        if (banned.pattern.test(content)) {
          allViolations.push({ file: rel, pattern: banned.description });
        }
      }
    }

    if (allViolations.length > 0) {
      const report = allViolations.map(v => `  ${v.file}: ${v.pattern}`).join('\n');
      expect.fail(`Found ${allViolations.length} Node.js builtin violations in packages/core/:\n${report}`);
    }
  });

  it('approved files are actually present', () => {
    for (const approved of APPROVED_FILES) {
      const fullPath = join(CORE_DIR, approved);
      expect(() => readFileSync(fullPath), `Approved file missing: ${approved}`).not.toThrow();
    }
  });

  it('no import type from better-sqlite3 (should use DatabaseHandle)', () => {
    const violations: string[] = [];

    for (const filePath of filesToScan) {
      const content = readFileSync(filePath, 'utf-8');
      if (/import\s+type\s+.*from\s+['"]better-sqlite3['"]/.test(content)) {
        const rel = relative(CORE_DIR, filePath).replace(/\\/g, '/');
        violations.push(rel);
      }
    }

    expect(violations, `Files with import type from better-sqlite3:\n  ${violations.join('\n  ')}`).toEqual([]);
  });

  it('no Database.Database type annotations (should use DatabaseHandle)', () => {
    const violations: string[] = [];

    for (const filePath of filesToScan) {
      const content = readFileSync(filePath, 'utf-8');
      if (/Database\.Database/.test(content)) {
        const rel = relative(CORE_DIR, filePath).replace(/\\/g, '/');
        violations.push(rel);
      }
    }

    expect(violations, `Files with Database.Database:\n  ${violations.join('\n  ')}`).toEqual([]);
  });
});
