/**
 * Step 20 — Privacy tests for Digital Representative.
 * Ensures no network/gateway imports in representative/, email sending via IPCClient only,
 * and financial data access is read-only.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPRESENTATIVE_DIR = path.resolve(__dirname, '../../../packages/core/representative');

function getRepresentativeFiles(): string[] {
  const files = fs.readdirSync(REPRESENTATIVE_DIR);
  return files.filter(f => f.endsWith('.ts')).map(f => path.join(REPRESENTATIVE_DIR, f));
}

function readAllRepresentativeCode(): string {
  return getRepresentativeFiles()
    .map(f => fs.readFileSync(f, 'utf-8'))
    .join('\n');
}

describe('Digital Representative Privacy (Step 20)', () => {
  it('zero network imports in representative/', () => {
    const code = readAllRepresentativeCode();
    // Check for import statements referencing network libraries
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

  it('zero gateway imports in representative/', () => {
    const code = readAllRepresentativeCode();
    // No direct gateway imports
    expect(code).not.toMatch(/from\s+['"].*gateway/);
    expect(code).not.toMatch(/from\s+['"]@semblance\/gateway/);
  });

  it('email sending only through IPCClient', () => {
    // action-manager.ts should use ipcClient.sendAction for email sending
    const actionManagerCode = fs.readFileSync(
      path.join(REPRESENTATIVE_DIR, 'action-manager.ts'), 'utf-8'
    );
    expect(actionManagerCode).toContain('ipcClient.sendAction');
    expect(actionManagerCode).toContain("'email.send'");

    // No direct email sending in other files
    const otherFiles = getRepresentativeFiles().filter(f => !f.includes('action-manager'));
    for (const file of otherFiles) {
      const code = fs.readFileSync(file, 'utf-8');
      expect(code).not.toContain('sendAction');
    }
  });

  it('financial data access is read-only', () => {
    // cancellation-engine.ts should only use getStoredCharges (read)
    const cancelCode = fs.readFileSync(
      path.join(REPRESENTATIVE_DIR, 'cancellation-engine.ts'), 'utf-8'
    );
    expect(cancelCode).toContain('getStoredCharges');
    // Should not directly modify recurring charges
    expect(cancelCode).not.toContain('storeCharges');
    expect(cancelCode).not.toContain('storeImport');
  });
});
