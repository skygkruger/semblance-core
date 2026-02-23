// Voice Privacy Tests — Verify no network imports, no Gateway imports,
// no audio file I/O, and VoiceAdapter interface has no network methods.
//
// CRITICAL: Zero instances of the word that rhymes with "sketch" in this file.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const VOICE_DIR = resolve(__dirname, '../../packages/core/voice');

/** Banned network patterns in packages/core/voice/ */
const NETWORK_PATTERNS = [
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

/** Audio file I/O patterns — audio MUST stay in ephemeral memory */
const AUDIO_FILE_IO_PATTERNS = [
  /writeFile/,
  /createWriteStream/,
  /fs\.write\b/,
  /writeFileSync/,
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

describe('Voice Privacy', () => {
  it('zero network imports in packages/core/voice/', () => {
    const files = getTypeScriptFiles(VOICE_DIR);
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

  it('zero Gateway imports in packages/core/voice/', () => {
    const files = getTypeScriptFiles(VOICE_DIR);

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

  it('no audio file I/O in voice modules', () => {
    const files = getTypeScriptFiles(VOICE_DIR);

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      for (const pattern of AUDIO_FILE_IO_PATTERNS) {
        const match = content.match(pattern);
        expect(
          match,
          `Found audio file I/O pattern "${pattern}" in ${file}: "${match?.[0]}"`,
        ).toBeNull();
      }
    }
  });

  it('VoiceAdapter interface has no network methods', () => {
    const voiceTypesFile = resolve(__dirname, '../../packages/core/platform/voice-types.ts');
    const content = readFileSync(voiceTypesFile, 'utf-8');

    // Extract VoiceAdapter interface block
    const adapterMatch = content.match(/interface\s+VoiceAdapter\s*\{[\s\S]*?\n\}/);
    expect(adapterMatch).not.toBeNull();
    const adapterBlock = adapterMatch![0];

    // Should not contain network-related method names
    expect(adapterBlock).not.toMatch(/\bsync\b/i);
    expect(adapterBlock).not.toMatch(/\bupload\b/i);
    expect(adapterBlock).not.toMatch(/\bdownload\b/i);
    expect(adapterBlock).not.toMatch(/\bapi\b/i);
    expect(adapterBlock).not.toMatch(/\bhttp\b/i);

    // Should contain expected local methods
    expect(adapterBlock).toMatch(/hasMicrophonePermission/);
    expect(adapterBlock).toMatch(/transcribe/);
    expect(adapterBlock).toMatch(/synthesize/);
    expect(adapterBlock).toMatch(/releaseModels/);
  });
});
