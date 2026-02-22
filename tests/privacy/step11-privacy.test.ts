// Step 11 Privacy Verification Tests
//
// Verifies that the style learning system complies with all privacy rules:
// - Style profiles stored in local SQLite only (never through Gateway)
// - Style extraction runs entirely in packages/core/ via InferenceRouter
// - Correction data stored locally only
// - No new network imports in packages/core/
// - Existing privacy audit still passes

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_DIR = join(ROOT, 'packages', 'core');
const STYLE_DIR = join(CORE_DIR, 'style');

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
          files.push(...collectTsFiles(fullPath));
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          files.push(fullPath);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // dir doesn't exist
  }
  return files;
}

describe('Step 11 Privacy: Style files have no network imports', () => {
  const styleFiles = collectTsFiles(STYLE_DIR);

  it('style directory exists with expected files', () => {
    expect(existsSync(STYLE_DIR)).toBe(true);
    const fileNames = styleFiles.map(f => relative(STYLE_DIR, f).replace(/\\/g, '/'));
    expect(fileNames).toContain('style-profile.ts');
    expect(fileNames).toContain('style-extractor.ts');
    expect(fileNames).toContain('style-injector.ts');
    expect(fileNames).toContain('style-scorer.ts');
    expect(fileNames).toContain('style-extraction-job.ts');
    expect(fileNames).toContain('style-correction-processor.ts');
  });

  it('no file in packages/core/style/ imports networking modules', () => {
    const violations: string[] = [];
    const banned = [
      'node:http', 'node:https', 'node:net', 'node:dgram', 'node:dns', 'node:tls',
      'fetch(', 'axios', 'got', 'node-fetch', 'undici', 'superagent',
      'XMLHttpRequest', 'WebSocket', 'socket.io',
    ];

    for (const file of styleFiles) {
      const content = readFileSync(file, 'utf-8');
      for (const term of banned) {
        if (content.includes(term)) {
          violations.push(`${relative(ROOT, file)}: contains '${term}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('no file in packages/core/style/ imports from Gateway', () => {
    const violations: string[] = [];

    for (const file of styleFiles) {
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes('packages/gateway') ||
        content.includes('@semblance/gateway') ||
        content.includes('../gateway') ||
        content.includes('../../gateway')
      ) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('style files only import from local packages/core/ paths and approved deps', () => {
    const approvedDeps = ['better-sqlite3', 'nanoid'];

    for (const file of styleFiles) {
      const content = readFileSync(file, 'utf-8');
      const fromLines = content.split('\n').filter(l => /\bfrom\s+['"]/.test(l));

      for (const line of fromLines) {
        const match = line.match(/from\s+['"]([^'"]+)['"]/);
        if (!match) continue;
        const importPath = match[1];

        // Must be either a relative import or an approved dependency
        const isRelative = importPath.startsWith('.');
        const isApproved = approvedDeps.some(d => importPath === d || importPath.startsWith(d + '/'));

        if (!isRelative && !isApproved) {
          throw new Error(
            `Unapproved import in ${relative(ROOT, file)}: '${importPath}'\n` +
            `Style files may only import from relative paths or approved deps: ${approvedDeps.join(', ')}`
          );
        }
      }
    }
  });
});

describe('Step 11 Privacy: Style data never transits Gateway', () => {
  it('no Gateway service adapter references style profiles', () => {
    const gatewayDir = join(ROOT, 'packages', 'gateway', 'services');
    if (!existsSync(gatewayDir)) return; // Gateway services might not exist yet

    const gatewayFiles = collectTsFiles(gatewayDir);
    const violations: string[] = [];

    for (const file of gatewayFiles) {
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes('StyleProfile') ||
        content.includes('style_profiles') ||
        content.includes('style-profile') ||
        content.includes('styleProfile')
      ) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('IPC action types do not include style operations', () => {
    const ipcTypesPath = join(CORE_DIR, 'types', 'ipc.ts');
    if (!existsSync(ipcTypesPath)) return;

    const content = readFileSync(ipcTypesPath, 'utf-8');
    expect(content).not.toContain("'style.");
    expect(content).not.toContain('"style.');
  });
});

describe('Step 11 Privacy: Style scorer is pure heuristic (no LLM)', () => {
  it('style-scorer.ts does not import LLMProvider', () => {
    const scorerPath = join(STYLE_DIR, 'style-scorer.ts');
    const content = readFileSync(scorerPath, 'utf-8');
    expect(content).not.toContain('LLMProvider');
    expect(content).not.toContain('llm');
    expect(content).not.toContain('chat(');
  });

  it('style-scorer.ts has no async functions', () => {
    const scorerPath = join(STYLE_DIR, 'style-scorer.ts');
    const content = readFileSync(scorerPath, 'utf-8');
    expect(content).not.toContain('async ');
    expect(content).not.toContain('Promise');
    expect(content).not.toContain('await ');
  });
});

describe('Step 11 Privacy: Full privacy audit still passes', () => {
  it('privacy audit exits clean', () => {
    const { execSync } = require('node:child_process');
    const result = execSync('node scripts/privacy-audit/index.js', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    expect(result).toContain('RESULT: CLEAN');
  });
});
