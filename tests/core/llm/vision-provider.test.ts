// Tests for VisionProvider — tier management, image analysis routing, LLMProvider interface.

import { describe, it, expect, beforeEach } from 'vitest';
import { VisionProvider } from '@semblance/core/llm/vision-provider.js';

describe('VisionProvider', () => {
  let provider: VisionProvider;

  beforeEach(() => {
    provider = new VisionProvider();
  });

  describe('tier configuration', () => {
    it('starts with no tiers loaded', () => {
      expect(provider.isLoaded('fast')).toBe(false);
      expect(provider.isLoaded('rich')).toBe(false);
    });

    it('configure sets up a fast tier', () => {
      provider.configure('fast', {
        modelId: 'moondream2-q8_0',
        modelPath: '/models/moondream2.gguf',
        mmProjectorPath: '/models/moondream2-mmproj.gguf',
      });
      // Configured but not yet loaded
      expect(provider.isLoaded('fast')).toBe(false);
    });

    it('configure sets up a rich tier', () => {
      provider.configure('rich', {
        modelId: 'qwen2.5-vl-3b-instruct-q4_k_m',
        modelPath: '/models/qwen-vl.gguf',
        mmProjectorPath: '/models/qwen-vl-mmproj.gguf',
      });
      expect(provider.isLoaded('rich')).toBe(false);
    });

    it('load marks tier as loaded', async () => {
      provider.configure('fast', {
        modelId: 'moondream2-q8_0',
        modelPath: '/models/moondream2.gguf',
        mmProjectorPath: '/models/moondream2-mmproj.gguf',
      });
      await provider.load('fast');
      expect(provider.isLoaded('fast')).toBe(true);
    });

    it('unload marks tier as unloaded', async () => {
      provider.configure('fast', {
        modelId: 'moondream2-q8_0',
        modelPath: '/models/moondream2.gguf',
        mmProjectorPath: '/models/moondream2-mmproj.gguf',
      });
      await provider.load('fast');
      await provider.unload('fast');
      expect(provider.isLoaded('fast')).toBe(false);
    });

    it('load throws for unconfigured tier', async () => {
      await expect(provider.load('fast')).rejects.toThrow('not configured');
    });
  });

  describe('analyzeImage', () => {
    it('returns response with model info when no bridge', async () => {
      provider.configure('fast', {
        modelId: 'moondream2-q8_0',
        modelPath: '/models/moondream2.gguf',
        mmProjectorPath: '/models/moondream2-mmproj.gguf',
      });
      const response = await provider.analyzeImage({
        imagePath: '/test/image.png',
        prompt: 'What is this?',
        tier: 'fast',
      });
      expect(response.modelUsed).toBe('moondream2-q8_0');
      expect(response.text).toContain('No inference bridge');
      expect(response.processingMs).toBeGreaterThanOrEqual(0);
    });

    it('analyzeFromPath delegates to analyzeImage', async () => {
      provider.configure('fast', {
        modelId: 'moondream2-q8_0',
        modelPath: '/m/m.gguf',
        mmProjectorPath: '/m/mmproj.gguf',
      });
      const response = await provider.analyzeFromPath('/test.png', 'Describe', 'fast');
      expect(response.modelUsed).toBe('moondream2-q8_0');
    });

    it('ocrDocument uses rich tier', async () => {
      provider.configure('rich', {
        modelId: 'qwen2.5-vl-3b',
        modelPath: '/m/qwen.gguf',
        mmProjectorPath: '/m/qwen-mmproj.gguf',
      });
      const response = await provider.ocrDocument('/test-doc.png');
      expect(response.modelUsed).toBe('qwen2.5-vl-3b');
    });
  });

  describe('getStatus', () => {
    it('returns status for both tiers', () => {
      const status = provider.getStatus();
      expect(status.fastLoaded).toBe(false);
      expect(status.richLoaded).toBe(false);
      expect(status.fastModel).toBeNull();
      expect(status.richModel).toBeNull();
    });

    it('reflects loaded state', async () => {
      provider.configure('fast', {
        modelId: 'moondream2',
        modelPath: '/m.gguf',
        mmProjectorPath: '/mm.gguf',
      });
      await provider.load('fast');
      const status = provider.getStatus();
      expect(status.fastLoaded).toBe(true);
      expect(status.fastModel).toBe('moondream2');
    });
  });

  describe('LLMProvider interface', () => {
    it('isAvailable returns false when nothing loaded', async () => {
      expect(await provider.isAvailable()).toBe(false);
    });

    it('isAvailable returns true when fast tier loaded', async () => {
      provider.configure('fast', {
        modelId: 'moondream2',
        modelPath: '/m.gguf',
        mmProjectorPath: '/mm.gguf',
      });
      await provider.load('fast');
      expect(await provider.isAvailable()).toBe(true);
    });

    it('listModels returns configured models', async () => {
      provider.configure('fast', { modelId: 'moondream2', modelPath: '/m.gguf', mmProjectorPath: '/mm.gguf' });
      provider.configure('rich', { modelId: 'qwen-vl', modelPath: '/q.gguf', mmProjectorPath: '/qm.gguf' });
      const models = await provider.listModels();
      expect(models).toHaveLength(2);
      expect(models.map(m => m.name)).toContain('moondream2');
      expect(models.map(m => m.name)).toContain('qwen-vl');
    });

    it('embed throws (vision does not support embeddings)', async () => {
      await expect(provider.embed({ model: '', input: 'test' })).rejects.toThrow('does not support embeddings');
    });
  });
});
