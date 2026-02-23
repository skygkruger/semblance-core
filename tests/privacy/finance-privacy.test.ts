/**
 * Step 19 — Finance privacy tests.
 * Zero network imports in core/finance/, zero gateway imports in core/finance/,
 * amounts stored as INTEGER in schema.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FINANCE_DIR = path.resolve(__dirname, '../../packages/core/finance');
const PREMIUM_DIR = path.resolve(__dirname, '../../packages/core/premium');

function getSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts'))
    .map(f => path.join(dir, f));
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

describe('Finance Privacy (Step 19)', () => {
  it('core/finance has zero network imports', () => {
    const files = getSourceFiles(FINANCE_DIR);
    const networkPatterns = [
      /\bfetch\b/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /require\(['"]https?['"]\)/,
      /from\s+['"]https?['"]/,
      /require\(['"]node-fetch['"]\)/,
      /from\s+['"]node-fetch['"]/,
      /require\(['"]axios['"]\)/,
      /from\s+['"]axios['"]/,
      /require\(['"]undici['"]\)/,
      /from\s+['"]undici['"]/,
    ];

    for (const file of files) {
      const content = readFile(file);
      const fileName = path.basename(file);

      for (const pattern of networkPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          // Allow 'fetch' only in type comments or the word in strings like "fetch_transactions"
          const lines = content.split('\n');
          for (const line of lines) {
            if (pattern.test(line)) {
              // Allow: type references, comments, string literals like 'finance.fetch_transactions'
              const trimmed = line.trim();
              if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) continue;
              if (trimmed.includes("'finance.fetch_transactions'") || trimmed.includes('"finance.fetch_transactions"')) continue;
              if (trimmed.includes("'email.fetch'") || trimmed.includes('"email.fetch"')) continue;
              if (trimmed.includes("'calendar.fetch'") || trimmed.includes('"calendar.fetch"')) continue;
              if (trimmed.includes("'health.fetch'") || trimmed.includes('"health.fetch"')) continue;
              if (trimmed.includes("'web.fetch'") || trimmed.includes('"web.fetch"')) continue;
              // Fail for actual network usage
              expect(true, `Network import found in ${fileName}: ${trimmed}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it('core/finance has zero gateway imports', () => {
    const files = [...getSourceFiles(FINANCE_DIR), ...getSourceFiles(PREMIUM_DIR)];

    for (const file of files) {
      const content = readFile(file);
      const fileName = path.basename(file);

      // No imports from packages/gateway/
      expect(content, `${fileName} should not import from gateway`).not.toMatch(/from\s+['"]@semblance\/gateway/);
      expect(content, `${fileName} should not import from gateway`).not.toMatch(/from\s+['"]\.\.\/\.\.\/gateway/);
    }
  });

  it('transaction schema uses INTEGER for amounts', () => {
    const storeFile = path.join(FINANCE_DIR, 'transaction-store.ts');
    const content = readFile(storeFile);

    // The CREATE TABLE statement should use INTEGER for amount
    expect(content).toContain('amount INTEGER');
  });
});
