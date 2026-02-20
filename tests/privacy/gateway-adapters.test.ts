// Privacy Audit Tests for Gateway Adapters — Verifies that IMAP, SMTP, and CalDAV
// libraries are only imported in packages/gateway/services/.
// No networking code should leak into Core or Desktop frontend.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT_DIR = join(__dirname, '..', '..');
const CORE_DIR = join(ROOT_DIR, 'packages', 'core');
const DESKTOP_SRC_DIR = join(ROOT_DIR, 'packages', 'desktop', 'src');
const GATEWAY_SERVICES_DIR = join(ROOT_DIR, 'packages', 'gateway', 'services');

// Networking libraries that should ONLY exist in gateway/services/
const GATEWAY_ONLY_LIBS = ['imapflow', 'nodemailer', 'tsdav'];

function collectFiles(dir: string, extensions: string[]): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
          files.push(...collectFiles(fullPath, extensions));
        } else if (extensions.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return files;
}

function scanForImports(dir: string, libs: string[]): { file: string; line: number; lib: string; content: string }[] {
  const violations: { file: string; line: number; lib: string; content: string }[] = [];
  const files = collectFiles(dir, ['.ts', '.tsx', '.js', '.jsx']);

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const lib of libs) {
        // Check for import statements
        const importPattern = new RegExp(`\\bimport\\b.*['"]${lib}['"]`);
        const requirePattern = new RegExp(`\\brequire\\s*\\(\\s*['"]${lib}['"]\\s*\\)`);
        if (importPattern.test(line) || requirePattern.test(line)) {
          violations.push({
            file: relative(ROOT_DIR, file),
            line: i + 1,
            lib,
            content: line.trim(),
          });
        }
      }
    }
  }

  return violations;
}

describe('Gateway Adapter Privacy', () => {
  it('IMAP/SMTP/CalDAV libraries are NOT imported in packages/core/', () => {
    const violations = scanForImports(CORE_DIR, GATEWAY_ONLY_LIBS);
    expect(violations).toHaveLength(0);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`VIOLATION: ${v.lib} imported in ${v.file}:${v.line} — ${v.content}`);
      }
    }
  });

  it('IMAP/SMTP/CalDAV libraries are NOT imported in packages/desktop/src/', () => {
    const violations = scanForImports(DESKTOP_SRC_DIR, GATEWAY_ONLY_LIBS);
    expect(violations).toHaveLength(0);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`VIOLATION: ${v.lib} imported in ${v.file}:${v.line} — ${v.content}`);
      }
    }
  });

  it('IMAP/SMTP/CalDAV libraries ARE present in packages/gateway/services/', () => {
    const gatewayFiles = collectFiles(GATEWAY_SERVICES_DIR, ['.ts', '.tsx', '.js', '.jsx']);

    // At least some of these libraries should be imported in gateway/services/
    const allContent = gatewayFiles.map(f => readFileSync(f, 'utf-8')).join('\n');

    // Check that each library is used somewhere in gateway/services/
    for (const lib of GATEWAY_ONLY_LIBS) {
      const pattern = new RegExp(`['"]${lib}['"]`);
      expect(pattern.test(allContent)).toBe(true);
    }
  });

  it('no fetch() calls in packages/core/ (except in ollama-allowed llm/ dir)', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx', '.js', '.jsx']);
    const violations: string[] = [];

    for (const file of files) {
      const relPath = relative(CORE_DIR, file).replace(/\\/g, '/');
      // Skip LLM directory (ollama uses fetch internally)
      if (relPath.startsWith('llm/')) continue;

      const content = readFileSync(file, 'utf-8');
      if (/\bfetch\s*\(/.test(content)) {
        violations.push(relative(ROOT_DIR, file));
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('no XMLHttpRequest or WebSocket in packages/core/', () => {
    const files = collectFiles(CORE_DIR, ['.ts', '.tsx', '.js', '.jsx']);
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      if (/\bnew\s+XMLHttpRequest\b/.test(content) || /\bnew\s+WebSocket\b/.test(content)) {
        violations.push(relative(ROOT_DIR, file));
      }
    }

    expect(violations).toHaveLength(0);
  });

  it('no networking libraries in packages/desktop/src/ frontend', () => {
    const bannedLibs = [
      'axios', 'got', 'node-fetch', 'undici', 'superagent',
      'socket.io', 'ws',
      ...GATEWAY_ONLY_LIBS,
    ];

    const violations = scanForImports(DESKTOP_SRC_DIR, bannedLibs);
    expect(violations).toHaveLength(0);
  });
});
