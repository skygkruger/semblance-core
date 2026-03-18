/**
 * Dynamic Import Protection Tests
 *
 * Verifies that the privacy audit's dynamic code execution detection patterns
 * correctly identify eval(), Function(), dynamic import(), and string
 * concatenation bypass patterns.
 *
 * Uses pattern-level unit tests to avoid race conditions with other privacy
 * tests that run the full audit script.
 */

import { describe, it, expect } from 'vitest';
import { runPrivacyAudit } from '../helpers/run-privacy-audit.js';

// ─── Detection patterns (must match scripts/privacy-audit/index.js) ───

const DYNAMIC_EXEC_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bFunction\s*\(\s*['"]/,
];

const DYNAMIC_IMPORT_PATTERN = /(?<!\.)(?<!\w)\bimport\s*\(\s*(?!['"`])/;

const FORBIDDEN_LIBS = [
  'axios', 'got', 'node-fetch', 'undici', 'superagent',
  'socket.io', 'ws', 'http', 'https', 'net', 'dgram', 'dns', 'tls',
];

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectConcatenatedForbiddenImport(line: string): string | null {
  if (!line.includes('+') && !line.includes('${')) return null;
  for (const lib of FORBIDDEN_LIBS) {
    if (lib.length < 3) continue;
    for (let splitAt = 1; splitAt < lib.length; splitAt++) {
      const left = lib.substring(0, splitAt);
      const right = lib.substring(splitAt);
      const concatPattern = new RegExp(
        `['"\`]${escapeRegex(left)}['"\`]\\s*\\+\\s*['"\`]${escapeRegex(right)}['"\`]`
      );
      if (concatPattern.test(line)) {
        return lib;
      }
    }
  }
  return null;
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.includes('.test.') || normalized.includes('.spec.');
}

describe('Dynamic Import Protection', () => {
  // ─── eval() detection ───

  it('detects eval() call', () => {
    const line = 'const result = eval(code);';
    expect(DYNAMIC_EXEC_PATTERNS[0]!.test(line)).toBe(true);
  });

  it('detects eval() with whitespace', () => {
    const line = 'const result = eval (code);';
    expect(DYNAMIC_EXEC_PATTERNS[0]!.test(line)).toBe(true);
  });

  // ─── Function() constructor detection ───

  it('detects new Function() constructor', () => {
    const line = 'const fn = new Function("return 42");';
    expect(DYNAMIC_EXEC_PATTERNS[1]!.test(line)).toBe(true);
  });

  it('detects Function() with string argument', () => {
    const line = 'const fn = Function("return 42");';
    expect(DYNAMIC_EXEC_PATTERNS[2]!.test(line)).toBe(true);
  });

  // ─── Dynamic import() detection ───

  it('detects import() with non-literal argument', () => {
    const line = 'const mod = await import(moduleName);';
    expect(DYNAMIC_IMPORT_PATTERN.test(line)).toBe(true);
  });

  it('does NOT flag import() with literal string argument', () => {
    const line = "const mod = await import('./local-module');";
    expect(DYNAMIC_IMPORT_PATTERN.test(line)).toBe(false);
  });

  it('does NOT flag import() with template literal argument', () => {
    const line = 'const mod = await import(`./local-module`);';
    expect(DYNAMIC_IMPORT_PATTERN.test(line)).toBe(false);
  });

  // ─── String concatenation detection ───

  it('detects string concatenation assembling "axios"', () => {
    const line = 'const lib = "ax" + "ios";';
    expect(detectConcatenatedForbiddenImport(line)).toBe('axios');
  });

  it('detects string concatenation assembling "node-fetch"', () => {
    const line = "const lib = 'node-' + 'fetch';";
    expect(detectConcatenatedForbiddenImport(line)).toBe('node-fetch');
  });

  it('detects string concatenation assembling "undici"', () => {
    const line = 'const lib = "und" + "ici";';
    expect(detectConcatenatedForbiddenImport(line)).toBe('undici');
  });

  it('does NOT flag safe string concatenation', () => {
    const line = 'const greeting = "hello" + " world";';
    expect(detectConcatenatedForbiddenImport(line)).toBeNull();
  });

  // ─── Comment and test file exclusions ───

  it('identifies comment lines correctly', () => {
    expect(isCommentLine('  // eval() is banned')).toBe(true);
    expect(isCommentLine('  /* eval */ ')).toBe(true);
    expect(isCommentLine('  * eval() used here')).toBe(true);
    expect(isCommentLine('  const x = eval(y);')).toBe(false);
  });

  it('identifies test files correctly', () => {
    expect(isTestFile('packages/core/foo.test.ts')).toBe(true);
    expect(isTestFile('packages/core/foo.spec.ts')).toBe(true);
    expect(isTestFile('packages/core/foo.ts')).toBe(false);
  });

  // ─── Full audit integration check ───

  it('privacy audit passes clean (no dynamic code execution violations in core)', () => {
    const output = runPrivacyAudit();
    expect(output).toContain('RESULT: CLEAN');
    expect(output).toContain('Dynamic code execution patterns checked: 0 violation(s) found');
  });
});
