// Tests for Commit 3: iOS MLX Bridge interface.
// Uses the MockMLXBridge since we can't run actual iOS native modules in tests.
// Verifies the bridge interface contract and adapter behavior.

import { describe, it, expect, beforeEach } from 'vitest';
import { MockMLXBridge } from '@semblance/core/llm/mobile-bridge-mock.js';
import { MobileProvider } from '@semblance/core/llm/mobile-provider.js';
import { MOBILE_MODEL_DEFAULTS } from '@semblance/core/llm/mobile-bridge-types.js';
import type { MobileInferenceBridge } from '@semblance/core/llm/mobile-bridge-types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

describe('iOS MLX Bridge — Native Module', () => {
  it('Swift native module file exists', () => {
    const swiftPath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    expect(fs.existsSync(swiftPath)).toBe(true);
  });

  it('Objective-C bridge file exists', () => {
    const bridgePath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXBridge.m');
    expect(fs.existsSync(bridgePath)).toBe(true);
  });

  it('Swift module exports required methods', () => {
    const swiftPath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    const content = fs.readFileSync(swiftPath, 'utf-8');

    // Required methods from MobileInferenceBridge
    expect(content).toContain('func loadModel');
    expect(content).toContain('func unloadModel');
    expect(content).toContain('func generate');
    expect(content).toContain('func embed');
    expect(content).toContain('func isModelLoaded');
    expect(content).toContain('func getMemoryUsage');
    expect(content).toContain('func getPlatform');
  });

  it('Swift module has memory warning handler', () => {
    const swiftPath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    const content = fs.readFileSync(swiftPath, 'utf-8');

    expect(content).toContain('handleMemoryWarning');
  });

  it('Swift module has no network imports', () => {
    const swiftPath = path.join(ROOT, 'packages/mobile/ios/SemblanceMLX/SemblanceMLXModule.swift');
    const content = fs.readFileSync(swiftPath, 'utf-8');

    expect(content).not.toContain('import Network');
    expect(content).not.toContain('URLSession');
    expect(content).not.toContain('URLRequest');
    expect(content).not.toContain('import Alamofire');
  });
});

describe('iOS MLX Bridge — JS Adapter', () => {
  it('JS adapter file exists', () => {
    const adapterPath = path.join(ROOT, 'packages/mobile/src/inference/mlx-bridge.ts');
    expect(fs.existsSync(adapterPath)).toBe(true);
  });

  it('JS adapter implements MobileInferenceBridge interface', () => {
    const adapterPath = path.join(ROOT, 'packages/mobile/src/inference/mlx-bridge.ts');
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

describe('iOS MLX Bridge — Mock Interface Compliance', () => {
  let bridge: MobileInferenceBridge;

  beforeEach(async () => {
    bridge = new MockMLXBridge();
    await bridge.loadModel('/device/models/llama-3b.gguf', MOBILE_MODEL_DEFAULTS.capable);
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
    const provider = new MobileProvider({ bridge, modelName: 'llama-3b-mlx' });

    const chatResult = await provider.chat({
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
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
