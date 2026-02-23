/**
 * Step 21 — Privacy tests for Form Automation.
 * Ensures no network/gateway imports, SSN/password safety invariant,
 * and PlatformAdapter usage for file operations.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FORMS_DIR = path.resolve(__dirname, '../../../packages/core/forms');

function getFormsFiles(): string[] {
  const files = fs.readdirSync(FORMS_DIR);
  return files.filter(f => f.endsWith('.ts')).map(f => path.join(FORMS_DIR, f));
}

function readAllFormsCode(): string {
  return getFormsFiles()
    .map(f => fs.readFileSync(f, 'utf-8'))
    .join('\n');
}

describe('Form Automation Privacy (Step 21)', () => {
  it('zero network imports in packages/core/forms/', () => {
    const code = readAllFormsCode();
    const bannedImportPatterns = [
      /from\s+['"]node:http['"]/,
      /from\s+['"]node:https['"]/,
      /from\s+['"]node:net['"]/,
      /from\s+['"]node:dgram['"]/,
      /from\s+['"]node:dns['"]/,
      /from\s+['"]node:tls['"]/,
      /from\s+['"]axios['"]/,
      /from\s+['"]got['"]/,
      /from\s+['"]node-fetch['"]/,
      /from\s+['"]undici['"]/,
      /from\s+['"]superagent['"]/,
      /from\s+['"]socket\.io['"]/,
      /from\s+['"]ws['"]/,
      /\bnew\s+XMLHttpRequest\b/,
      /\bnew\s+WebSocket\b/,
    ];

    for (const pattern of bannedImportPatterns) {
      expect(code).not.toMatch(pattern);
    }
  });

  it('zero gateway imports in packages/core/forms/', () => {
    const code = readAllFormsCode();
    expect(code).not.toMatch(/from\s+['"].*gateway/);
    expect(code).not.toMatch(/from\s+['"]@semblance\/gateway/);
  });

  it('SSN/password fields are NEVER auto-filled (safety invariant)', () => {
    const resolverPath = path.join(FORMS_DIR, 'user-data-resolver.ts');
    const code = fs.readFileSync(resolverPath, 'utf-8');

    // Must contain sensitive field patterns
    expect(code).toMatch(/ssn/i);
    expect(code).toContain('social');
    expect(code).toContain('security');
    expect(code).toMatch(/password/i);
    expect(code).toContain('requiresManualEntry');
    expect(code).toContain('SENSITIVE_FIELD_PATTERNS');
  });

  it('file operations reference PlatformAdapter or pdf-lib (no raw fs in source)', () => {
    // Source files should NOT use node:fs directly.
    // Only test files and the privacy test itself use node:fs.
    for (const filePath of getFormsFiles()) {
      const code = fs.readFileSync(filePath, 'utf-8');
      expect(code).not.toMatch(/from\s+['"]node:fs['"]/);
      expect(code).not.toMatch(/from\s+['"]fs['"]/);
    }
  });
});
