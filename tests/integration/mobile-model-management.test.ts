/**
 * Mobile Model Management Tests — Download lifecycle, WiFi enforcement,
 * SHA-256 integrity, caching, storage budget, and tier mapping.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MobileModelManager,
  MOBILE_MODEL_REGISTRY,
  selectReasoningModel,
  selectEmbeddingModel,
  getRequiredModels,
  getTotalDownloadSize,
  formatBytes,
} from '../../packages/core/llm/mobile-model-manager.js';
import type {
  MobileModelEntry,
  NetworkConnectivity,
} from '../../packages/core/llm/mobile-model-manager.js';
import { classifyMobileDevice } from '../../packages/core/llm/mobile-bridge-types.js';

describe('Mobile Model Management', () => {
  let manager: MobileModelManager;
  const testModel = MOBILE_MODEL_REGISTRY[0]!; // llama-3.2-3b-q4

  const wifiConnected: NetworkConnectivity = { isConnected: true, isWifi: true, isCellular: false };
  const cellularOnly: NetworkConnectivity = { isConnected: true, isWifi: false, isCellular: true };
  const offline: NetworkConnectivity = { isConnected: false, isWifi: false, isCellular: false };

  beforeEach(() => {
    manager = new MobileModelManager({
      storageDir: '/data/models',
      wifiOnly: true,
      storageBudget: { maxTotalBytes: 4_000_000_000 },
    });
  });

  // ─── WiFi Enforcement ───────────────────────────────────────────────────

  describe('WiFi-only enforcement', () => {
    it('allows download on WiFi', () => {
      const result = manager.requestDownload(testModel, wifiConnected);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects download on cellular when wifiOnly enabled', () => {
      const result = manager.requestDownload(testModel, cellularOnly);
      expect(result.success).toBe(false);
      expect(result.error).toContain('WiFi');
    });

    it('allows download on cellular when wifiOnly disabled', () => {
      manager.setWifiOnly(false);
      const result = manager.requestDownload(testModel, cellularOnly);
      expect(result.success).toBe(true);
    });

    it('rejects download when offline', () => {
      const result = manager.requestDownload(testModel, offline);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No network');
    });
  });

  // ─── SHA-256 Integrity ──────────────────────────────────────────────────

  describe('SHA-256 integrity verification', () => {
    it('passes when hash matches', () => {
      const result = manager.verifyIntegrity(testModel, testModel.expectedSha256);
      expect(result.valid).toBe(true);
      expect(result.expected).toBe(testModel.expectedSha256);
      expect(result.actual).toBe(testModel.expectedSha256);
    });

    it('fails when hash does not match', () => {
      const result = manager.verifyIntegrity(testModel, 'wrong-hash-value');
      expect(result.valid).toBe(false);
      expect(result.expected).toBe(testModel.expectedSha256);
      expect(result.actual).toBe('wrong-hash-value');
    });

    it('logs integrity result to audit log', () => {
      manager.verifyIntegrity(testModel, testModel.expectedSha256);
      const log = manager.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0]!.action).toBe('integrity.passed');

      manager.verifyIntegrity(testModel, 'bad-hash');
      const log2 = manager.getAuditLog();
      expect(log2.length).toBe(2);
      expect(log2[1]!.action).toBe('integrity.failed');
    });
  });

  // ─── Model Caching ──────────────────────────────────────────────────────

  describe('model caching', () => {
    it('returns cached result when model already downloaded', () => {
      manager.registerCachedModel(testModel.id, '/data/models/test.gguf');
      const result = manager.requestDownload(testModel, wifiConnected);
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
      expect(result.localPath).toBe('/data/models/test.gguf');
    });

    it('skips network checks when cached', () => {
      manager.registerCachedModel(testModel.id, '/data/models/test.gguf');
      // Even offline, cached model should return success
      const result = manager.requestDownload(testModel, offline);
      expect(result.success).toBe(true);
      expect(result.cached).toBe(true);
    });
  });

  // ─── Device Capability → Model Tier Mapping ────────────────────────────

  describe('device capability → model tier mapping', () => {
    it('capable device gets 3B reasoning model', () => {
      const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
      const model = selectReasoningModel(profile);
      expect(model).not.toBeNull();
      expect(model!.sizeTier).toBe('3B');
    });

    it('constrained device gets 1.5B reasoning model', () => {
      const profile = classifyMobileDevice('android', 4096, 'Snapdragon 695');
      const model = selectReasoningModel(profile);
      expect(model).not.toBeNull();
      expect(model!.sizeTier).toBe('1.5B');
    });

    it('none tier gets no reasoning model', () => {
      const profile = classifyMobileDevice('android', 2048, 'Mediatek Helio');
      const model = selectReasoningModel(profile);
      expect(model).toBeNull();
    });

    it('all tiers get an embedding model (except none)', () => {
      const capable = classifyMobileDevice('ios', 8192, 'A17 Pro');
      expect(selectEmbeddingModel(capable)).not.toBeNull();

      const constrained = classifyMobileDevice('android', 4096, 'SD695');
      expect(selectEmbeddingModel(constrained)).not.toBeNull();

      const none = classifyMobileDevice('android', 2048, 'MT');
      expect(selectEmbeddingModel(none)).toBeNull();
    });
  });

  // ─── Model Deletion ─────────────────────────────────────────────────────

  describe('model deletion', () => {
    it('removes model from cache', () => {
      manager.registerCachedModel('test-model', '/data/models/test.gguf');
      expect(manager.isModelCached('test-model')).toBe(true);

      const deleted = manager.deleteModel('test-model');
      expect(deleted).toBe(true);
      expect(manager.isModelCached('test-model')).toBe(false);
    });

    it('returns false for non-existent model', () => {
      const deleted = manager.deleteModel('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  // ─── Gateway Audit Trail ────────────────────────────────────────────────

  describe('gateway audit trail', () => {
    it('logs download start', () => {
      manager.requestDownload(testModel, wifiConnected);
      const log = manager.getAuditLog();
      expect(log.some(e => e.action === 'download.started')).toBe(true);
    });

    it('logs WiFi rejection', () => {
      manager.requestDownload(testModel, cellularOnly);
      const log = manager.getAuditLog();
      expect(log.some(e => e.action === 'download.rejected')).toBe(true);
    });

    it('audit entries include timestamps', () => {
      manager.requestDownload(testModel, wifiConnected);
      const log = manager.getAuditLog();
      expect(log.length).toBeGreaterThan(0);
      for (const entry of log) {
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  // ─── Storage Budget ─────────────────────────────────────────────────────

  describe('storage budget enforcement', () => {
    it('rejects download exceeding budget', () => {
      // Set tiny budget
      const tinyManager = new MobileModelManager({
        storageDir: '/data/models',
        storageBudget: { maxTotalBytes: 500_000_000 }, // 500MB
      });

      // Try to download 1.8GB model
      const result = tinyManager.requestDownload(testModel, wifiConnected);
      expect(result.success).toBe(false);
      expect(result.error).toContain('storage budget');
    });

    it('allows download within budget', () => {
      const result = manager.requestDownload(testModel, wifiConnected);
      expect(result.success).toBe(true);
    });

    it('tracks remaining budget after caching', () => {
      const initial = manager.getRemainingBudget();
      expect(initial).toBe(4_000_000_000);

      manager.registerCachedModel(testModel.id, '/data/models/test.gguf');
      const after = manager.getRemainingBudget();
      expect(after).toBeLessThan(initial);
      expect(after).toBe(4_000_000_000 - testModel.expectedSizeBytes);
    });
  });

  // ─── Download Lifecycle ─────────────────────────────────────────────────

  describe('download lifecycle', () => {
    it('tracks download progress', () => {
      manager.startDownload('test', 1_000_000);
      const state = manager.getDownloadState('test');
      expect(state).not.toBeNull();
      expect(state!.status).toBe('pending');

      manager.updateProgress('test', 500_000);
      const updated = manager.getDownloadState('test');
      expect(updated!.status).toBe('downloading');
      expect(updated!.progressPercent).toBe(50);
    });

    it('marks download complete at 100%', () => {
      manager.startDownload('test', 1_000_000);
      manager.updateProgress('test', 1_000_000);
      const state = manager.getDownloadState('test');
      expect(state!.status).toBe('completed');
      expect(state!.progressPercent).toBe(100);
      // Model should now be cached
      expect(manager.isModelCached('test')).toBe(true);
    });

    it('supports pause and resume', () => {
      manager.startDownload('test', 1_000_000);
      manager.updateProgress('test', 300_000);

      manager.pauseDownload('test');
      expect(manager.getDownloadState('test')!.status).toBe('paused');

      manager.resumeDownload('test');
      expect(manager.getDownloadState('test')!.status).toBe('downloading');
    });

    it('handles error state', () => {
      manager.startDownload('test', 1_000_000);
      manager.failDownload('test', 'Network timeout');
      const state = manager.getDownloadState('test');
      expect(state!.status).toBe('error');
      expect(state!.error).toBe('Network timeout');
    });
  });

  // ─── Helper Functions ───────────────────────────────────────────────────

  describe('helper functions', () => {
    it('formatBytes formats correctly', () => {
      expect(formatBytes(1_800_000_000)).toBe('1.8 GB');
      expect(formatBytes(70_000_000)).toBe('70.0 MB');
      expect(formatBytes(500)).toBe('500 bytes');
    });

    it('getTotalDownloadSize sums model sizes', () => {
      const profile = classifyMobileDevice('ios', 8192, 'A17 Pro');
      const totalSize = getTotalDownloadSize(profile);
      expect(totalSize).toBeGreaterThan(0);

      const models = getRequiredModels(profile);
      const manualSum = models.reduce((s, m) => s + m.expectedSizeBytes, 0);
      expect(totalSize).toBe(manualSum);
    });

    it('model registry has required entries', () => {
      expect(MOBILE_MODEL_REGISTRY.length).toBeGreaterThanOrEqual(3);
      // Must have at least one reasoning and one embedding model
      expect(MOBILE_MODEL_REGISTRY.some(m => m.type === 'reasoning')).toBe(true);
      expect(MOBILE_MODEL_REGISTRY.some(m => m.type === 'embedding')).toBe(true);
    });
  });
});
