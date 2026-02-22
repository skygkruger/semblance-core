// Direct Provider Usage Guard Test — Enforces exit criterion 8.
//
// LOCKED DECISION: Source-analysis test that greps packages/core/ for direct
// LLMProvider constructor usage or direct provider instantiation outside of
// allowed files. Pattern: same approach as privacy audit and Sprint 2 exit criteria tests.
//
// Allowed files that may directly reference provider implementations:
// - inference-router.ts (routes to providers)
// - native-provider.ts (IS a provider)
// - ollama-provider.ts (IS a provider)
// - index.ts (factory + re-exports)
// - types.ts (interface definition)
// - native-bridge-types.ts (bridge interface)

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CORE_LLM_DIR = join(process.cwd(), 'packages', 'core', 'llm');
const CORE_DIR = join(process.cwd(), 'packages', 'core');

// Files that are ALLOWED to directly reference provider classes
const ALLOWED_PROVIDER_FILES = new Set([
  'inference-router.ts',
  'native-provider.ts',
  'ollama-provider.ts',
  'index.ts',
  'types.ts',
  'native-bridge-types.ts',
  'hardware-types.ts',
  'model-registry.ts',
  'inference-types.ts',
  'model-storage.ts',
  'model-manager.ts',
]);

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Direct Provider Usage Guard', () => {
  it('no file outside packages/core/llm/ and core/index.ts directly imports OllamaProvider', () => {
    const allFiles = getAllTsFiles(CORE_DIR);
    const violations: string[] = [];

    // Allow: llm/ directory (providers live there), index.ts (factory/re-exports)
    const ALLOWED_ROOTS = ['llm', 'index.ts'];

    for (const file of allFiles) {
      const relPath = relative(CORE_DIR, file);
      if (ALLOWED_ROOTS.some(root => relPath.startsWith(root) || relPath === root)) continue;

      const content = readFileSync(file, 'utf-8');
      if (content.includes('OllamaProvider') || content.includes('new Ollama(')) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no file outside packages/core/llm/ and core/index.ts directly imports NativeProvider', () => {
    const allFiles = getAllTsFiles(CORE_DIR);
    const violations: string[] = [];

    const ALLOWED_ROOTS = ['llm', 'index.ts'];

    for (const file of allFiles) {
      const relPath = relative(CORE_DIR, file);
      if (ALLOWED_ROOTS.some(root => relPath.startsWith(root) || relPath === root)) continue;

      const content = readFileSync(file, 'utf-8');
      if (content.includes('NativeProvider')) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('no file in packages/core/llm/ outside allowed list directly constructs OllamaProvider', () => {
    const allFiles = getAllTsFiles(CORE_LLM_DIR);
    const violations: string[] = [];

    for (const file of allFiles) {
      const filename = file.split(/[/\\]/).pop()!;
      if (ALLOWED_PROVIDER_FILES.has(filename)) continue;

      const content = readFileSync(file, 'utf-8');
      if (content.includes('new OllamaProvider') || content.includes('new NativeProvider')) {
        violations.push(filename);
      }
    }

    expect(violations).toEqual([]);
  });

  it('callers use LLMProvider interface, not concrete provider types', () => {
    // Check key caller files — they should import LLMProvider type, not provider classes
    const callerFiles = [
      join(CORE_DIR, 'agent', 'orchestrator.ts'),
      join(CORE_DIR, 'agent', 'email-categorizer.ts'),
      join(CORE_DIR, 'knowledge', 'indexer.ts'),
      join(CORE_DIR, 'knowledge', 'search.ts'),
      join(CORE_DIR, 'digest', 'weekly-digest.ts'),
    ];

    for (const file of callerFiles) {
      try {
        const content = readFileSync(file, 'utf-8');
        const relPath = relative(CORE_DIR, file);

        // Should NOT directly import concrete providers
        expect(content).not.toContain('import { OllamaProvider }');
        expect(content).not.toContain('import { NativeProvider }');
        expect(content).not.toContain('new OllamaProvider');
        expect(content).not.toContain('new NativeProvider');

        // Should import the LLMProvider interface
        expect(content).toContain('LLMProvider');
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw err;
      }
    }
  });

  it('no direct createLLMProvider calls outside llm/, core/index.ts and bridge', () => {
    const allFiles = getAllTsFiles(CORE_DIR);
    const violations: string[] = [];

    const ALLOWED_ROOTS = ['llm', 'index.ts'];

    for (const file of allFiles) {
      const relPath = relative(CORE_DIR, file);
      if (ALLOWED_ROOTS.some(root => relPath.startsWith(root) || relPath === root)) continue;

      const content = readFileSync(file, 'utf-8');
      if (content.includes('createLLMProvider(')) {
        violations.push(relPath);
      }
    }

    expect(violations).toEqual([]);
  });

  it('createLLMProvider returns InferenceRouter, not a bare provider', () => {
    // The factory MUST wrap the provider in InferenceRouter.
    // Verify the source: createLLMProvider must construct an InferenceRouter.
    const indexPath = join(CORE_LLM_DIR, 'index.ts');
    const content = readFileSync(indexPath, 'utf-8');

    // Extract the createLLMProvider function body
    const fnStart = content.indexOf('export function createLLMProvider');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = content.slice(fnStart);

    // Must construct InferenceRouter, not return bare OllamaProvider
    expect(fnBody).toContain('new InferenceRouter(');
    // Must NOT have a code path that returns new OllamaProvider directly
    expect(fnBody).not.toMatch(/return\s+new\s+OllamaProvider/);
    expect(fnBody).not.toMatch(/return\s+provider\s*;/);
  });

  it('createSemblanceCore uses createLLMProvider (routes through InferenceRouter)', () => {
    const coreIndexPath = join(CORE_DIR, 'index.ts');
    const content = readFileSync(coreIndexPath, 'utf-8');

    // SemblanceCore must use createLLMProvider, not construct providers directly
    expect(content).toContain('createLLMProvider(');
    expect(content).not.toContain('new OllamaProvider(');
    expect(content).not.toContain('new NativeProvider(');
  });
});
