// Tests for Commit 4: Android llama.cpp Bridge interface.
// Uses MockLlamaCppBridge since we can't run actual Android native modules in tests.
// Verifies the bridge interface contract and adapter behavior.

import { describe, it, expect, beforeEach } from 'vitest';
import { MockLlamaCppBridge } from '@semblance/core/llm/mobile-bridge-mock.js';
import { MobileProvider } from '@semblance/core/llm/mobile-provider.js';
import { MOBILE_MODEL_DEFAULTS } from '@semblance/core/llm/mobile-bridge-types.js';
import type { MobileInferenceBridge } from '@semblance/core/llm/mobile-bridge-types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('Android llama.cpp Bridge — Native Module', () => {
  it('Kotlin native module file exists', () => {
    const kotlinPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    expect(fs.existsSync(kotlinPath)).toBe(true);
  });

  it('Kotlin module exports required methods', () => {
    const kotlinPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    const content = fs.readFileSync(kotlinPath, 'utf-8');

    expect(content).toContain('fun loadModel');
    expect(content).toContain('fun unloadModel');
    expect(content).toContain('fun generate');
    expect(content).toContain('fun embed');
    expect(content).toContain('fun isModelLoaded');
    expect(content).toContain('fun getMemoryUsage');
    expect(content).toContain('fun getPlatform');
  });

  it('Kotlin module has memory pressure handler', () => {
    const kotlinPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    const content = fs.readFileSync(kotlinPath, 'utf-8');

    expect(content).toContain('onTrimMemory');
  });

  it('Kotlin module loads native library semblance_llama', () => {
    const kotlinPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    const content = fs.readFileSync(kotlinPath, 'utf-8');

    expect(content).toContain('System.loadLibrary("semblance_llama")');
  });

  it('Kotlin module has no network imports', () => {
    const kotlinPath = path.join(ROOT, 'packages/mobile/android/app/src/main/java/com/semblance/llm/SemblanceLlamaModule.kt');
    const content = fs.readFileSync(kotlinPath, 'utf-8');

    expect(content).not.toContain('java.net');
    expect(content).not.toContain('okhttp');
    expect(content).not.toContain('retrofit');
    expect(content).not.toContain('HttpURLConnection');
  });
});

describe('Android llama.cpp Bridge — JS Adapter', () => {
  it('JS adapter file exists', () => {
    const adapterPath = path.join(ROOT, 'packages/mobile/src/inference/llamacpp-bridge.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);
  });

  it('JS adapter implements MobileInferenceBridge interface', () => {
    const adapterPath = path.join(ROOT, 'packages/mobile/src/inference/llamacpp-bridge.ts');
    const content = fs.readFileSync(adapterPath, 'utf-8');

    expect(content).toContain('implements MobileInferenceBridge');
    expect(content).toContain('loadModel');
    expect(content).toContain('generate');
    expect(content).toContain('embed');
    expect(content).toContain('unloadModel');
    expect(content).toContain('isModelLoaded');
    expect(content).toContain('getMemoryUsage');
    expect(content).toContain('getPlatform');
  });
});

describe('Android llama.cpp Bridge — Mock Interface Compliance', () => {
  let bridge: MobileInferenceBridge;

  beforeEach(async () => {
    bridge = new MockLlamaCppBridge();
    await bridge.loadModel('/data/app/models/llama-3b.gguf', MOBILE_MODEL_DEFAULTS.capable);
  });

  it('implements full MobileInferenceBridge interface', () => {
    expect(typeof bridge.loadModel).toBe('function');
    expect(typeof bridge.generate).toBe('function');
    expect(typeof bridge.embed).toBe('function');
    expect(typeof bridge.unloadModel).toBe('function');
    expect(typeof bridge.isModelLoaded).toBe('function');
    expect(typeof bridge.getMemoryUsage).toBe('function');
    expect(typeof bridge.getPlatform).toBe('function');
  });

  it('works end-to-end through MobileProvider', async () => {
    const provider = new MobileProvider({ bridge, modelName: 'llama-3b-cpp' });

    const chatResult = await provider.chat({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      model: '',
    });

    expect(chatResult.message.role).toBe('assistant');
    expect(chatResult.message.content.length).toBeGreaterThan(0);

    const embedResult = await provider.embed({
      input: 'test embedding',
      model: '',
    });

    expect(embedResult.embeddings[0]).toHaveLength(384);
  });
});
