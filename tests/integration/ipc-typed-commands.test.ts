/**
 * IPC Typed Commands Integration Tests
 *
 * Static analysis validating:
 * - ipc/commands.ts exists and exports functions
 * - ipc/types.ts has no 'any' type annotations
 * - Every exported function in commands.ts calls invoke()
 * - commands.ts imports from '@tauri-apps/api/core'
 * - No screen file directly imports from '@tauri-apps/api/core' (all go through ipc/)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const IPC_DIR = join(ROOT, 'packages', 'desktop', 'src', 'ipc');
const COMMANDS_PATH = join(IPC_DIR, 'commands.ts');
const TYPES_PATH = join(IPC_DIR, 'types.ts');
const SCREENS_DIR = join(ROOT, 'packages', 'desktop', 'src', 'screens');

describe('IPC Typed Commands — Structure', () => {
  it('ipc/commands.ts exists and exports functions', () => {
    expect(existsSync(COMMANDS_PATH)).toBe(true);
    const content = readFileSync(COMMANDS_PATH, 'utf-8');
    // Must export at least one function
    const exportedFunctions = content.match(/^export function \w+/gm);
    expect(exportedFunctions).not.toBeNull();
    expect(exportedFunctions!.length).toBeGreaterThan(5);
  });

  it('ipc/types.ts exists and has no "any" type annotations', () => {
    expect(existsSync(TYPES_PATH)).toBe(true);
    const content = readFileSync(TYPES_PATH, 'utf-8');
    // Strip comments before checking for 'any'
    const withoutComments = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // Match standalone 'any' used as a type annotation (e.g., ': any', '<any>', '| any')
    const anyMatches = withoutComments.match(/:\s*any\b|<\s*any\s*>|\|\s*any\b/g);
    expect(anyMatches).toBeNull();
  });

  it('every exported function in commands.ts calls invoke() or a helper that calls invoke()', () => {
    const content = readFileSync(COMMANDS_PATH, 'utf-8');
    // Extract all exported function names
    const exportedFns = content.match(/^export function (\w+)/gm);
    expect(exportedFns).not.toBeNull();

    // Identify internal helper functions that call invoke (e.g., sidecarRequest)
    const helperPattern = /^function (\w+)/gm;
    const helpers: string[] = [];
    let match;
    while ((match = helperPattern.exec(content)) !== null) {
      const helperName = match[1]!;
      const helperStart = content.indexOf(`function ${helperName}`);
      const helperBody = content.slice(helperStart, helperStart + 300);
      if (helperBody.includes('invoke')) {
        helpers.push(helperName);
      }
    }

    for (const fnLine of exportedFns!) {
      const fnName = fnLine.replace('export function ', '');
      const fnStart = content.indexOf(`export function ${fnName}`);
      expect(fnStart).toBeGreaterThan(-1);

      // Extract a reasonable chunk of the function body (up to 500 chars)
      const fnBody = content.slice(fnStart, fnStart + 500);
      const callsInvoke = fnBody.includes('invoke');
      const callsHelper = helpers.some((h) => fnBody.includes(h));
      expect(callsInvoke || callsHelper).toBe(true);
    }
  });

  it('commands.ts imports from @tauri-apps/api/core', () => {
    const content = readFileSync(COMMANDS_PATH, 'utf-8');
    expect(content).toContain("from '@tauri-apps/api/core'");
  });

  it('no screen file directly imports from @tauri-apps/api/core', () => {
    const screenFiles = readdirSync(SCREENS_DIR).filter(
      (f) => f.endsWith('.tsx') || f.endsWith('.ts'),
    );
    expect(screenFiles.length).toBeGreaterThan(0);

    for (const file of screenFiles) {
      const content = readFileSync(join(SCREENS_DIR, file), 'utf-8');
      expect(content).not.toContain("from '@tauri-apps/api/core'");
    }
  });
});
