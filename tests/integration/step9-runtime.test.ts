// Integration: Step 9 Runtime — Hardware detection, model registry, native runtime bridge.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('Step 9: Hardware Detection Integration', () => {
  const hwTypesPath = join(ROOT, 'packages', 'core', 'llm', 'hardware-types.ts');
  const hwRustPath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'hardware.rs');
  const bridgePath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');

  it('hardware-types.ts exists and exports classifyHardware', () => {
    expect(existsSync(hwTypesPath)).toBe(true);
    const content = readFileSync(hwTypesPath, 'utf-8');
    expect(content).toContain('export function classifyHardware');
    expect(content).toContain('HardwareProfileTier');
  });

  it('hardware.rs exists and has detect_hardware function', () => {
    expect(existsSync(hwRustPath)).toBe(true);
    const content = readFileSync(hwRustPath, 'utf-8');
    expect(content).toContain('pub fn detect_hardware');
    expect(content).toContain('sysinfo');
  });

  it('bridge handles hardware:detect requests', () => {
    const content = readFileSync(bridgePath, 'utf-8');
    expect(content).toContain("'hardware:detect'");
    expect(content).toContain('handleDetectHardware');
  });

  it('Rust lib.rs registers detect_hardware command', () => {
    const libPath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'lib.rs');
    const content = readFileSync(libPath, 'utf-8');
    expect(content).toContain('detect_hardware');
  });
});

describe('Step 9: Model Registry Integration', () => {
  const registryPath = join(ROOT, 'packages', 'core', 'llm', 'model-registry.ts');

  it('model-registry.ts exists with model catalog', () => {
    expect(existsSync(registryPath)).toBe(true);
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('MODEL_CATALOG');
    expect(content).toContain('nomic-embed-text');
    expect(content).toContain('qwen2.5');
  });

  it('exports getRecommendedReasoningModel', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('export function getRecommendedReasoningModel');
  });

  it('exports getEmbeddingModel', () => {
    const content = readFileSync(registryPath, 'utf-8');
    expect(content).toContain('export function getEmbeddingModel');
  });

  it('all models point to HuggingFace repos', () => {
    const content = readFileSync(registryPath, 'utf-8');
    // Every model entry should have an hfRepo field
    expect(content).toContain('hfRepo:');
    // No models should point to non-HF repos
    expect(content).not.toContain('modelscope');
  });
});

describe('Step 9: Native Runtime Bridge', () => {
  const nativeRuntimePath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'src', 'native_runtime.rs');
  const bridgePath = join(ROOT, 'packages', 'desktop', 'src-tauri', 'sidecar', 'bridge.ts');

  it('native_runtime.rs exists', () => {
    expect(existsSync(nativeRuntimePath)).toBe(true);
  });

  it('native_runtime.rs has generate and embed methods', () => {
    const content = readFileSync(nativeRuntimePath, 'utf-8');
    expect(content).toContain('pub fn generate');
    expect(content).toContain('pub fn embed');
  });

  it('bridge.ts has sendCallback for NDJSON reverse-call', () => {
    const content = readFileSync(bridgePath, 'utf-8');
    expect(content).toContain('sendCallback');
    expect(content).toContain('callback');
    expect(content).toContain('pendingCallbacks');
  });
});
