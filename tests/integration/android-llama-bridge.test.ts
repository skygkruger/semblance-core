/**
 * Android llama.cpp Bridge Tests — Verify the adapter layer with mock native module.
 *
 * Same test pattern as iOS MLX bridge, using MockLlamaCppBridge.
 * Tests run on desktop without requiring Android NDK.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockLlamaCppBridge } from '../../packages/core/llm/mobile-bridge-mock.js';
import type { MobileInferenceBridge } from '../../packages/core/llm/mobile-bridge-types.js';

describe('Android llama.cpp Bridge (via MockLlamaCppBridge)', () => {
  let bridge: MobileInferenceBridge;

  beforeEach(() => {
    bridge = new MockLlamaCppBridge();
  });

  // ACID TEST: generated text must NOT be placeholder
  it('acid test: generate returns non-placeholder text', async () => {
    await bridge.loadModel('/data/models/llama3.2-3b.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    let text = '';
    for await (const token of bridge.generate('What is 2+2?', { maxTokens: 100 })) {
      text += token;
    }

    expect(text).not.toBe('');
    expect(text.toLowerCase()).not.toContain('placeholder');
    expect(text.toLowerCase()).not.toContain('todo');
    expect(text.toLowerCase()).not.toContain('not implemented');
    expect(text.length).toBeGreaterThan(5);
  });

  it('model lifecycle: load → generate → unload', async () => {
    expect(bridge.isModelLoaded()).toBe(false);

    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });
    expect(bridge.isModelLoaded()).toBe(true);

    let text = '';
    for await (const token of bridge.generate('hello', { maxTokens: 10 })) {
      text += token;
    }
    expect(text.length).toBeGreaterThan(0);

    await bridge.unloadModel();
    expect(bridge.isModelLoaded()).toBe(false);
  });

  it('generate without load throws error', async () => {
    await expect(async () => {
      for await (const _token of bridge.generate('test', {})) {
        // Should throw before yielding
      }
    }).rejects.toThrow();
  });

  it('embed without load throws error', async () => {
    await expect(bridge.embed('test')).rejects.toThrow();
  });

  it('streaming: tokens arrive incrementally', async () => {
    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    const tokens: string[] = [];
    for await (const token of bridge.generate('Tell me a story', { maxTokens: 50 })) {
      tokens.push(token);
    }

    expect(tokens.length).toBeGreaterThan(1);
    for (const t of tokens) {
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('embed produces valid embedding vector', async () => {
    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    const result = await bridge.embed('hello world');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(384);
    for (const v of result) {
      expect(typeof v).toBe('number');
      expect(isFinite(v)).toBe(true);
    }
  });

  it('different inputs produce different embeddings', async () => {
    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    const emb1 = await bridge.embed('hello');
    const emb2 = await bridge.embed('world of different length');

    let same = true;
    for (let i = 0; i < emb1.length; i++) {
      if (emb1[i] !== emb2[i]) { same = false; break; }
    }
    expect(same).toBe(false);
  });

  it('device capability returns real-shaped hardware info', async () => {
    const memory = await bridge.getMemoryUsage();
    expect(memory).toHaveProperty('used');
    expect(memory).toHaveProperty('available');
    expect(typeof memory.used).toBe('number');
    expect(typeof memory.available).toBe('number');
    expect(memory.available).toBeGreaterThan(0);
  });

  it('memory usage reflects model state', async () => {
    const before = await bridge.getMemoryUsage();
    expect(before.used).toBe(0);

    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    const after = await bridge.getMemoryUsage();
    expect(after.used).toBeGreaterThan(0);
  });

  it('getPlatform returns android', () => {
    expect(bridge.getPlatform()).toBe('android');
  });

  it('unload then generate throws', async () => {
    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });
    await bridge.unloadModel();

    await expect(async () => {
      for await (const _token of bridge.generate('test', {})) {
        // Should throw
      }
    }).rejects.toThrow();
  });

  it('generate response differs by prompt', async () => {
    await bridge.loadModel('/data/models/test.gguf', {
      contextLength: 2048,
      batchSize: 32,
      threads: 0,
    });

    let text1 = '';
    for await (const token of bridge.generate('What is 2+2?', {})) {
      text1 += token;
    }

    let text2 = '';
    for await (const token of bridge.generate('Tell me about space', {})) {
      text2 += token;
    }

    expect(text1).not.toBe(text2);
  });

  it('MLX vs LlamaCpp bridges produce different outputs', async () => {
    const { MockMLXBridge } = await import('../../packages/core/llm/mobile-bridge-mock.js');
    const mlx = new MockMLXBridge();
    const llama = new MockLlamaCppBridge();

    await mlx.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });
    await llama.loadModel('/models/test.gguf', { contextLength: 2048, batchSize: 32, threads: 0 });

    let mlxText = '';
    for await (const token of mlx.generate('hello', {})) { mlxText += token; }

    let llamaText = '';
    for await (const token of llama.generate('hello', {})) { llamaText += token; }

    // They should produce different prefixes (MLX vs LlamaCpp)
    expect(mlxText).not.toBe(llamaText);
  });
});
