// Contacts Privacy Tests — Verify no network imports in contacts code,
// ContactsAdapter has no network methods, and no Gateway imports.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const CONTACTS_DIR = resolve(__dirname, '../../packages/core/knowledge/contacts');
const PROACTIVE_DIR = resolve(__dirname, '../../packages/core/agent/proactive');

/** Banned network patterns in packages/core/ contacts code */
const NETWORK_PATTERNS = [
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\brequire\s*\(\s*['"]http['"]\s*\)/,
  /\brequire\s*\(\s*['"]https['"]\s*\)/,
  /\brequire\s*\(\s*['"]net['"]\s*\)/,
  /\bimport\b.*['"]axios['"]/,
  /\bimport\b.*['"]node-fetch['"]/,
  /\bimport\b.*['"]got['"]/,
  /\bimport\b.*['"]undici['"]/,
];

const GATEWAY_PATTERNS = [
  /from\s+['"].*gateway/,
  /import\s+.*['"].*gateway/,
  /require\s*\(\s*['"].*gateway/,
];

function getTypeScriptFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...getTypeScriptFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

describe('Contacts Privacy', () => {
  it('no network imports in packages/core/knowledge/contacts/', () => {
    const files = getTypeScriptFiles(CONTACTS_DIR);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of NETWORK_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found network pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('no Gateway imports in contacts code', () => {
    const contactFiles = getTypeScriptFiles(CONTACTS_DIR);
    const proactiveFiles = getTypeScriptFiles(PROACTIVE_DIR);
    const allFiles = [...contactFiles, ...proactiveFiles];

    for (const file of allFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of GATEWAY_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found Gateway import in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('ContactsAdapter interface has no network methods', () => {
    const typesFile = resolve(__dirname, '../../packages/core/platform/types.ts');
    const content = readFileSync(typesFile, 'utf-8');

    // Extract the ContactsAdapter interface block
    const adapterMatch = content.match(/interface\s+ContactsAdapter\s*\{[\s\S]*?\n\}/);
    expect(adapterMatch).not.toBeNull();

    const adapterBlock = adapterMatch![0];

    // Should not contain any network-related method names
    expect(adapterBlock).not.toMatch(/\bfetch\b/);
    expect(adapterBlock).not.toMatch(/\bsync\b/i);
    expect(adapterBlock).not.toMatch(/\bupload\b/i);
    expect(adapterBlock).not.toMatch(/\bdownload\b/i);
    expect(adapterBlock).not.toMatch(/\bapi\b/i);

    // Should contain expected local methods
    expect(adapterBlock).toMatch(/getAllContacts/);
    expect(adapterBlock).toMatch(/requestPermission/);
  });
});
