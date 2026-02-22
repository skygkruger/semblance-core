// Clipboard Privacy Tests — Verify no network imports in clipboard code,
// no Gateway imports, no full clipboard text storage, and no network on adapter.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const CLIPBOARD_DIR = resolve(__dirname, '../../packages/core/agent/clipboard');
const CLIPBOARD_TYPES_FILE = resolve(__dirname, '../../packages/core/platform/clipboard-types.ts');

/** Banned network patterns in packages/core/ clipboard code */
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

/** Patterns that would indicate full clipboard text is being stored */
const FULL_TEXT_STORAGE_PATTERNS = [
  /clipboardText/,
  /clipboard_text/,
  /full_text/,
  /raw_text/,
  /fullClipboard/,
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

describe('Clipboard Privacy', () => {
  it('no network imports in packages/core/agent/clipboard/', () => {
    const files = getTypeScriptFiles(CLIPBOARD_DIR);
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

  it('no Gateway imports in clipboard code', () => {
    const files = getTypeScriptFiles(CLIPBOARD_DIR);

    for (const file of files) {
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

  it('no full clipboard text storage patterns in clipboard code', () => {
    const files = getTypeScriptFiles(CLIPBOARD_DIR);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of FULL_TEXT_STORAGE_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found full clipboard text storage pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('ClipboardAdapter interface has no network methods', () => {
    const content = readFileSync(CLIPBOARD_TYPES_FILE, 'utf-8');

    // Extract the ClipboardAdapter interface block
    const adapterMatch = content.match(/interface\s+ClipboardAdapter\s*\{[\s\S]*?\n\}/);
    expect(adapterMatch).not.toBeNull();

    const adapterBlock = adapterMatch![0];

    // Should not contain any network-related method names
    expect(adapterBlock).not.toMatch(/\bfetch\b/);
    expect(adapterBlock).not.toMatch(/\bsync\b/i);
    expect(adapterBlock).not.toMatch(/\bupload\b/i);
    expect(adapterBlock).not.toMatch(/\bdownload\b/i);
    expect(adapterBlock).not.toMatch(/\bapi\b/i);

    // Should contain expected local methods
    expect(adapterBlock).toMatch(/readClipboard/);
    expect(adapterBlock).toMatch(/writeClipboard/);
    expect(adapterBlock).toMatch(/onClipboardChanged/);
  });
});
