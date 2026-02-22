// Step 9 Privacy Verification Tests
//
// Verifies that the new Step 9 patterns comply with all privacy rules:
// - NativeProvider uses dependency injection (no Tauri/platform imports)
// - packages/core/ has no llama-cpp or llama.cpp imports
// - Model downloads flow through Gateway (model-adapter.ts), not Core
// - InferenceRouter stays in Core and has no network imports
// - Embedding pipeline has no network access
// - No new network access introduced in packages/core/

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_DIR = join(ROOT, 'packages', 'core');
const CORE_LLM_DIR = join(CORE_DIR, 'llm');
const CORE_KNOWLEDGE_DIR = join(CORE_DIR, 'knowledge');
const GATEWAY_DIR = join(ROOT, 'packages', 'gateway');

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

describe('Step 9 Privacy: NativeProvider uses dependency injection', () => {
  const nativeProviderPath = join(CORE_LLM_DIR, 'native-provider.ts');
  const nativeBridgePath = join(CORE_LLM_DIR, 'native-bridge-types.ts');

  it('NativeProvider does not import Tauri', () => {
    const content = readFileSync(nativeProviderPath, 'utf-8');
    expect(content).not.toContain('@tauri-apps');
    expect(content).not.toContain('tauri');
  });

  it('NativeProvider does not import any platform-specific code', () => {
    const content = readFileSync(nativeProviderPath, 'utf-8');
    expect(content).not.toContain('electron');
    expect(content).not.toContain('react-native');
    expect(content).not.toContain('node:child_process');
  });

  it('NativeProvider imports only from local types (no network modules)', () => {
    const content = readFileSync(nativeProviderPath, 'utf-8');
    // Find lines with 'from' clauses — multi-line imports have 'from' on a separate line
    const fromLines = content.split('\n').filter(l => /\bfrom\s+['"]/.test(l));
    for (const line of fromLines) {
      // All imports should be relative (./types.js, ./native-bridge-types.js)
      expect(line).toMatch(/from\s+['"]\.\//);
    }
  });

  it('NativeProvider accepts bridge via constructor injection', () => {
    const content = readFileSync(nativeProviderPath, 'utf-8');
    expect(content).toContain('bridge: NativeRuntimeBridge');
    expect(content).toContain('this.bridge = config.bridge');
  });

  it('NativeRuntimeBridge is a pure interface (no implementations)', () => {
    const content = readFileSync(nativeBridgePath, 'utf-8');
    // Should only contain interfaces, no classes or function implementations
    expect(content).not.toContain('class ');
    expect(content).toContain('export interface NativeRuntimeBridge');
    // No import statements for network or platform modules
    const importLines = content.split('\n').filter(l => l.trim().startsWith('import'));
    expect(importLines).toHaveLength(0);
  });
});

describe('Step 9 Privacy: No llama-cpp imports in packages/core/', () => {
  const coreFiles = collectTsFiles(CORE_DIR);

  it('no file in packages/core/ imports llama-cpp or llama.cpp', () => {
    const violations: string[] = [];

    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes("'llama-cpp") ||
        content.includes('"llama-cpp') ||
        content.includes("'llama_cpp") ||
        content.includes('"llama_cpp') ||
        content.includes("'llama.cpp") ||
        content.includes('"llama.cpp')
      ) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('no file in packages/core/ imports Rust FFI bindings', () => {
    const violations: string[] = [];

    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf-8');
      if (
        content.includes('napi') ||
        content.includes('node-ffi') ||
        content.includes('ffi-napi')
      ) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('Step 9 Privacy: Model downloads flow through Gateway', () => {
  it('model-adapter.ts exists in packages/gateway/', () => {
    const adapterPath = join(GATEWAY_DIR, 'services', 'model-adapter.ts');
    expect(existsSync(adapterPath)).toBe(true);
  });

  it('model-adapter.ts restricts downloads to HuggingFace domains only', () => {
    const adapterPath = join(GATEWAY_DIR, 'services', 'model-adapter.ts');
    const content = readFileSync(adapterPath, 'utf-8');
    expect(content).toContain('ALLOWED_DOWNLOAD_DOMAINS');
    expect(content).toContain('huggingface.co');
    // Should not have any other download domains
    expect(content).not.toContain('modelscope');
    expect(content).not.toContain('civitai');
  });

  it('no model download code in packages/core/', () => {
    const coreFiles = collectTsFiles(CORE_DIR);
    const violations: string[] = [];

    for (const file of coreFiles) {
      const relPath = relative(CORE_DIR, file).replace(/\\/g, '/');
      // model-storage.ts handles local paths, not downloads — exclude it
      if (relPath.includes('model-storage')) continue;
      // model-registry.ts has model catalog metadata — exclude it
      if (relPath.includes('model-registry')) continue;

      const content = readFileSync(file, 'utf-8');
      // No file in Core should perform HTTP downloads
      if (
        /\bfetch\s*\(\s*['"]https:\/\/.*huggingface/.test(content) ||
        content.includes('download_model') && content.includes('fetch(')
      ) {
        violations.push(relative(ROOT, file));
      }
    }

    expect(violations).toEqual([]);
  });

  it('Gateway validator routes model.download correctly', () => {
    const validatorPath = join(GATEWAY_DIR, 'ipc', 'validator.ts');
    const content = readFileSync(validatorPath, 'utf-8');
    expect(content).toContain("action === 'model.download'");
    expect(content).toContain("'huggingface.co'");
  });
});

describe('Step 9 Privacy: InferenceRouter has no network access', () => {
  it('inference-router.ts has no network imports', () => {
    const routerPath = join(CORE_LLM_DIR, 'inference-router.ts');
    const content = readFileSync(routerPath, 'utf-8');

    // No networking modules
    expect(content).not.toContain('node:http');
    expect(content).not.toContain('node:https');
    expect(content).not.toContain('node:net');
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('axios');
    expect(content).not.toContain('XMLHttpRequest');
    expect(content).not.toContain('WebSocket');
  });

  it('inference-router.ts only imports from local type files', () => {
    const routerPath = join(CORE_LLM_DIR, 'inference-router.ts');
    const content = readFileSync(routerPath, 'utf-8');
    // Find lines with 'from' clauses — multi-line imports have 'from' on a separate line
    const fromLines = content.split('\n').filter(l => /\bfrom\s+['"]/.test(l));
    for (const line of fromLines) {
      expect(line).toMatch(/from\s+['"]\.\//);
    }
  });
});

describe('Step 9 Privacy: Embedding pipeline has no network access', () => {
  const pipelinePath = join(CORE_KNOWLEDGE_DIR, 'embedding-pipeline.ts');
  const embedderPath = join(CORE_KNOWLEDGE_DIR, 'retroactive-embedder.ts');

  it('embedding-pipeline.ts has no network imports', () => {
    const content = readFileSync(pipelinePath, 'utf-8');
    expect(content).not.toContain('node:http');
    expect(content).not.toContain('node:https');
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('axios');
    expect(content).not.toContain('@tauri-apps');
  });

  it('retroactive-embedder.ts has no network imports', () => {
    const content = readFileSync(embedderPath, 'utf-8');
    expect(content).not.toContain('node:http');
    expect(content).not.toContain('node:https');
    expect(content).not.toContain('fetch(');
    expect(content).not.toContain('axios');
    expect(content).not.toContain('@tauri-apps');
  });
});

describe('Step 9 Privacy: Full privacy audit still passes', () => {
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
