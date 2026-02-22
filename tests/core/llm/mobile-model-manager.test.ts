// Tests for Commit 5: Mobile Model Management.
// Verifies model selection for different device profiles, download lifecycle,
// WiFi-only restrictions, resume after interruption, and cache persistence.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MobileModelManager,
  MOBILE_MODEL_REGISTRY,
  selectReasoningModel,
  selectEmbeddingModel,
  getRequiredModels,
  getTotalDownloadSize,
  formatBytes,
} from '@semblance/core/llm/mobile-model-manager.js';
import type { MobileDeviceProfile } from '@semblance/core/llm/mobile-bridge-types.js';

// ─── Test Device Profiles ───────────────────────────────────────────────────

const CAPABLE_DEVICE = {
  platform: 'ios',
  ramMb: 8192,
  tier: 'capable',
  recommendedModelSize: '3B',
  description: 'iPhone 15 Pro — 8GB RAM, capable tier',
} as unknown as MobileDeviceProfile;

const CONSTRAINED_DEVICE = {
  platform: 'android',
  ramMb: 4096,
  tier: 'constrained',
  recommendedModelSize: '1.5B',
  description: 'Budget Android — 4GB RAM, constrained tier',
} as unknown as MobileDeviceProfile;

const NONE_DEVICE = {
  platform: 'android',
  ramMb: 2048,
  tier: 'none',
  recommendedModelSize: null,
  description: 'Low-end device — 2GB RAM, inference not supported',
} as unknown as MobileDeviceProfile;

// ─── Model Registry ─────────────────────────────────────────────────────────

describe('Mobile Model Registry', () => {
  it('contains reasoning and embedding models', () => {
    const reasoning = MOBILE_MODEL_REGISTRY.filter(m => m.type === 'reasoning');
    const embedding = MOBILE_MODEL_REGISTRY.filter(m => m.type === 'embedding');

    expect(reasoning.length).toBeGreaterThanOrEqual(2);
    expect(embedding.length).toBeGreaterThanOrEqual(1);
  });

  it('has 3B and 1.5B reasoning models', () => {
    const sizes = MOBILE_MODEL_REGISTRY
      .filter(m => m.type === 'reasoning')
      .map(m => m.sizeTier);

    expect(sizes).toContain('3B');
    expect(sizes).toContain('1.5B');
  });

  it('all models have required fields', () => {
    for (const model of MOBILE_MODEL_REGISTRY) {
      expect(model.id).toBeTruthy();
      expect(model.name).toBeTruthy();
      expect(model.hfRepo).toBeTruthy();
      expect(model.hfFilename).toBeTruthy();
      expect(model.expectedSizeBytes).toBeGreaterThan(0);
      expect(model.expectedSha256).toBeTruthy();
      expect(model.minRamMb).toBeGreaterThan(0);
    }
  });

  it('3B models require more RAM than 1.5B models', () => {
    const threeB = MOBILE_MODEL_REGISTRY.find(m => m.sizeTier === '3B' && m.type === 'reasoning');
    const onePointFiveB = MOBILE_MODEL_REGISTRY.find(m => m.sizeTier === '1.5B' && m.type === 'reasoning');

    expect(threeB).toBeDefined();
    expect(onePointFiveB).toBeDefined();
    expect(threeB!.minRamMb).toBeGreaterThan(onePointFiveB!.minRamMb);
  });
});

// ─── Model Selection ────────────────────────────────────────────────────────

describe('Mobile Model Selection', () => {
  it('selects 3B reasoning model for capable device', () => {
    const model = selectReasoningModel(CAPABLE_DEVICE);
    expect(model).not.toBeNull();
    expect(model!.sizeTier).toBe('3B');
    expect(model!.type).toBe('reasoning');
  });

  it('selects 1.5B reasoning model for constrained device', () => {
    const model = selectReasoningModel(CONSTRAINED_DEVICE);
    expect(model).not.toBeNull();
    expect(model!.sizeTier).toBe('1.5B');
    expect(model!.type).toBe('reasoning');
  });

  it('returns null for none-tier device', () => {
    const model = selectReasoningModel(NONE_DEVICE);
    expect(model).toBeNull();
  });

  it('selects embedding model for capable device', () => {
    const model = selectEmbeddingModel(CAPABLE_DEVICE);
    expect(model).not.toBeNull();
    expect(model!.type).toBe('embedding');
  });

  it('selects embedding model for constrained device', () => {
    const model = selectEmbeddingModel(CONSTRAINED_DEVICE);
    expect(model).not.toBeNull();
    expect(model!.type).toBe('embedding');
  });

  it('returns null embedding for none-tier device', () => {
    const model = selectEmbeddingModel(NONE_DEVICE);
    expect(model).toBeNull();
  });

  it('respects RAM limits — does not select model exceeding device RAM', () => {
    const lowRamCapable = {
      platform: 'android',
      ramMb: 3200, // Just above 1.5B min (3072) but below 3B min (5120)
      tier: 'capable',
      recommendedModelSize: '3B',
      description: 'Low RAM capable device',
    } as unknown as MobileDeviceProfile;

    const model = selectReasoningModel(lowRamCapable);
    // Should return null because 3B model needs 5120 MB but device only has 3200
    expect(model).toBeNull();
  });
});

// ─── Required Models & Download Size ────────────────────────────────────────

describe('Required Models and Download Size', () => {
  it('returns reasoning + embedding for capable device', () => {
    const models = getRequiredModels(CAPABLE_DEVICE);
    expect(models.length).toBe(2);
    const types = models.map(m => m.type);
    expect(types).toContain('reasoning');
    expect(types).toContain('embedding');
  });

  it('returns reasoning + embedding for constrained device', () => {
    const models = getRequiredModels(CONSTRAINED_DEVICE);
    expect(models.length).toBe(2);
  });

  it('returns empty for none-tier device', () => {
    const models = getRequiredModels(NONE_DEVICE);
    expect(models).toHaveLength(0);
  });

  it('calculates total download size', () => {
    const size = getTotalDownloadSize(CAPABLE_DEVICE);
    expect(size).toBeGreaterThan(0);
    // 3B model (~1.8GB) + embedding (~70MB)
    expect(size).toBeGreaterThan(1_800_000_000);
  });

  it('constrained device has smaller download than capable', () => {
    const capableSize = getTotalDownloadSize(CAPABLE_DEVICE);
    const constrainedSize = getTotalDownloadSize(CONSTRAINED_DEVICE);
    expect(constrainedSize).toBeLessThan(capableSize);
  });
});

// ─── Format Bytes ───────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats gigabytes', () => {
    expect(formatBytes(1_800_000_000)).toBe('1.8 GB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(70_000_000)).toBe('70.0 MB');
  });

  it('formats small byte counts', () => {
    expect(formatBytes(500)).toBe('500 bytes');
  });
});

// ─── MobileModelManager — Download Lifecycle ────────────────────────────────

describe('MobileModelManager — Download Lifecycle', () => {
  let manager: MobileModelManager;

  beforeEach(() => {
    manager = new MobileModelManager({
      storageDir: '/data/app/models',
      wifiOnly: true,
    });
  });

  it('starts with WiFi-only enabled by default', () => {
    const defaultManager = new MobileModelManager({ storageDir: '/tmp' });
    expect(defaultManager.isWifiOnly()).toBe(true);
  });

  it('respects custom WiFi-only setting', () => {
    const cellularManager = new MobileModelManager({
      storageDir: '/tmp',
      wifiOnly: false,
    });
    expect(cellularManager.isWifiOnly()).toBe(false);
  });

  it('can toggle WiFi-only mode', () => {
    expect(manager.isWifiOnly()).toBe(true);
    manager.setWifiOnly(false);
    expect(manager.isWifiOnly()).toBe(false);
  });

  it('starts a download with pending status', () => {
    const download = manager.startDownload('llama-3.2-3b-q4', 1_800_000_000);

    expect(download.modelId).toBe('llama-3.2-3b-q4');
    expect(download.status).toBe('pending');
    expect(download.bytesDownloaded).toBe(0);
    expect(download.totalBytes).toBe(1_800_000_000);
    expect(download.progressPercent).toBe(0);
    expect(download.wifiOnly).toBe(true);
  });

  it('tracks download progress', () => {
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);

    const updated = manager.updateProgress('llama-3.2-3b-q4', 500_000);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('downloading');
    expect(updated!.progressPercent).toBe(50);
    expect(updated!.bytesDownloaded).toBe(500_000);
  });

  it('marks download as completed at 100%', () => {
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);

    const completed = manager.updateProgress('llama-3.2-3b-q4', 1_000_000);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('completed');
    expect(completed!.progressPercent).toBe(100);
  });

  it('registers model path on completion', () => {
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);
    manager.updateProgress('llama-3.2-3b-q4', 1_000_000);

    expect(manager.isModelCached('llama-3.2-3b-q4')).toBe(true);
    expect(manager.getModelPath('llama-3.2-3b-q4')).toBe('/data/app/models/llama-3.2-3b-q4.gguf');
  });

  it('returns null for unknown download progress', () => {
    const result = manager.updateProgress('nonexistent', 100);
    expect(result).toBeNull();
  });
});

// ─── MobileModelManager — Pause / Resume ────────────────────────────────────

describe('MobileModelManager — Pause and Resume', () => {
  let manager: MobileModelManager;

  beforeEach(() => {
    manager = new MobileModelManager({ storageDir: '/data/app/models' });
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);
    manager.updateProgress('llama-3.2-3b-q4', 300_000);
  });

  it('pauses an active download', () => {
    const paused = manager.pauseDownload('llama-3.2-3b-q4');
    expect(paused).toBe(true);

    const state = manager.getDownloadState('llama-3.2-3b-q4');
    expect(state!.status).toBe('paused');
    expect(state!.bytesDownloaded).toBe(300_000); // Preserves progress
  });

  it('resumes a paused download', () => {
    manager.pauseDownload('llama-3.2-3b-q4');

    const resumed = manager.resumeDownload('llama-3.2-3b-q4');
    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe('downloading');
    expect(resumed!.bytesDownloaded).toBe(300_000); // Still has progress
  });

  it('cannot pause a non-downloading model', () => {
    manager.pauseDownload('llama-3.2-3b-q4');
    // Already paused — pause again should return false
    const result = manager.pauseDownload('llama-3.2-3b-q4');
    expect(result).toBe(false);
  });

  it('cannot resume a non-paused model', () => {
    // Currently downloading, not paused
    const result = manager.resumeDownload('llama-3.2-3b-q4');
    expect(result).toBeNull();
  });
});

// ─── MobileModelManager — Error Handling ────────────────────────────────────

describe('MobileModelManager — Error Handling', () => {
  let manager: MobileModelManager;

  beforeEach(() => {
    manager = new MobileModelManager({ storageDir: '/data/app/models' });
  });

  it('marks download as errored', () => {
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);
    manager.failDownload('llama-3.2-3b-q4', 'Network disconnected');

    const state = manager.getDownloadState('llama-3.2-3b-q4');
    expect(state!.status).toBe('error');
    expect(state!.error).toBe('Network disconnected');
  });

  it('does not crash on failing nonexistent download', () => {
    // Should not throw
    manager.failDownload('nonexistent', 'test error');
    expect(manager.getDownloadState('nonexistent')).toBeNull();
  });
});

// ─── MobileModelManager — Cache Management ──────────────────────────────────

describe('MobileModelManager — Cache Management', () => {
  let manager: MobileModelManager;

  beforeEach(() => {
    manager = new MobileModelManager({ storageDir: '/data/app/models' });
  });

  it('model is not cached initially', () => {
    expect(manager.isModelCached('llama-3.2-3b-q4')).toBe(false);
    expect(manager.getModelPath('llama-3.2-3b-q4')).toBeNull();
  });

  it('registers a cached model manually', () => {
    manager.registerCachedModel('llama-3.2-3b-q4', '/data/app/models/llama-3.2-3b-q4.gguf');

    expect(manager.isModelCached('llama-3.2-3b-q4')).toBe(true);
    expect(manager.getModelPath('llama-3.2-3b-q4')).toBe('/data/app/models/llama-3.2-3b-q4.gguf');
  });

  it('deletes a cached model', () => {
    manager.registerCachedModel('llama-3.2-3b-q4', '/data/app/models/llama-3.2-3b-q4.gguf');
    const deleted = manager.deleteModel('llama-3.2-3b-q4');

    expect(deleted).toBe(true);
    expect(manager.isModelCached('llama-3.2-3b-q4')).toBe(false);
    expect(manager.getModelPath('llama-3.2-3b-q4')).toBeNull();
  });

  it('delete returns false for uncached model', () => {
    const deleted = manager.deleteModel('nonexistent');
    expect(deleted).toBe(false);
  });

  it('delete also clears download state', () => {
    manager.startDownload('llama-3.2-3b-q4', 1_000_000);
    manager.updateProgress('llama-3.2-3b-q4', 1_000_000);

    expect(manager.getDownloadState('llama-3.2-3b-q4')).not.toBeNull();
    manager.deleteModel('llama-3.2-3b-q4');
    expect(manager.getDownloadState('llama-3.2-3b-q4')).toBeNull();
  });

  it('returns correct storage directory', () => {
    expect(manager.getStorageDir()).toBe('/data/app/models');
  });
});
