// Messaging Privacy Tests — Verify no network imports in messaging code,
// no Gateway imports, and no network methods on adapter.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const MESSAGING_DIR = resolve(__dirname, '../../packages/core/agent/messaging');

/** Banned network patterns in packages/core/ messaging code */
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

describe('Messaging Privacy', () => {
  it('no network imports in packages/core/agent/messaging/', () => {
    const files = getTypeScriptFiles(MESSAGING_DIR);
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

  it('no Gateway imports in messaging code', () => {
    const files = getTypeScriptFiles(MESSAGING_DIR);

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

  it('MessagingAdapter interface has no network methods', () => {
    const typesFile = resolve(__dirname, '../../packages/core/platform/messaging-types.ts');
    const content = readFileSync(typesFile, 'utf-8');

    // Extract the MessagingAdapter interface block
    const adapterMatch = content.match(/interface\s+MessagingAdapter\s*\{[\s\S]*?\n\}/);
    expect(adapterMatch).not.toBeNull();

    const adapterBlock = adapterMatch![0];

    // Should not contain any network-related method names
    expect(adapterBlock).not.toMatch(/\bfetch\b/);
    expect(adapterBlock).not.toMatch(/\bsync\b/i);
    expect(adapterBlock).not.toMatch(/\bupload\b/i);
    expect(adapterBlock).not.toMatch(/\bdownload\b/i);
    expect(adapterBlock).not.toMatch(/\bapi\b/i);

    // Should contain expected local methods
    expect(adapterBlock).toMatch(/sendMessage/);
    expect(adapterBlock).toMatch(/isAvailable/);
    expect(adapterBlock).toMatch(/getCapabilities/);
  });
});
