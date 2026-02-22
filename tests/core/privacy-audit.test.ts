// Tests for the privacy audit script — verifies exceptions and blocks are correct.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_DIR = join(ROOT, 'packages', 'core');

describe('Privacy Audit', () => {
  it('passes with the current codebase (ollama in llm/ is allowed)', () => {
    const result = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result).toContain('RESULT: CLEAN');
  });

  it('allows ollama import in packages/core/llm/', () => {
    // The actual ollama-provider.ts already imports 'ollama' — verify audit passes
    const result = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result).toContain('Ollama localhost exception applied');
    expect(result).toContain('RESULT: CLEAN');
  });

  it('blocks ollama import outside packages/core/llm/', () => {
    const testDir = join(CORE_DIR, '_privacy_test_temp_');
    const testFile = join(testDir, 'bad-import.ts');

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testFile, "import { Ollama } from 'ollama';\n");

      const result = execSync('node scripts/privacy-audit/index.js', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // If we get here, the audit didn't fail — that's a problem
      expect.fail('Privacy audit should have failed');
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      const output = (error.stdout ?? '') + (error.stderr ?? '');
      expect(output).toContain('VIOLATION');
      expect(output).toContain('ollama');
    } finally {
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Windows EPERM on temp cleanup is non-fatal
      }
    }
  });

  it('blocks fetch() in packages/core/', () => {
    const testDir = join(CORE_DIR, '_privacy_test_temp_');
    const testFile = join(testDir, 'bad-fetch.ts');

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testFile, "const result = await fetch('http://evil.com');\n");

      const result = execSync('node scripts/privacy-audit/index.js', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect.fail('Privacy audit should have failed');
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      const output = (error.stdout ?? '') + (error.stderr ?? '');
      expect(output).toContain('VIOLATION');
      expect(output).toContain('fetch');
    } finally {
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Windows EPERM on temp cleanup is non-fatal
      }
    }
  });

  it('blocks http import in packages/core/', () => {
    const testDir = join(CORE_DIR, '_privacy_test_temp_');
    const testFile = join(testDir, 'bad-http.ts');

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(testFile, "import http from 'node:http';\n");

      const result = execSync('node scripts/privacy-audit/index.js', {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect.fail('Privacy audit should have failed');
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string };
      const output = (error.stdout ?? '') + (error.stderr ?? '');
      expect(output).toContain('VIOLATION');
      expect(output).toContain('http');
    } finally {
      try {
        if (existsSync(testDir)) {
          rmSync(testDir, { recursive: true, force: true });
        }
      } catch {
        // Windows EPERM on temp cleanup is non-fatal
      }
    }
  });
});
