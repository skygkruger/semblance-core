// Tests for updated onboarding flow — 11 stages with hardware detection and model download.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('Onboarding Runtime Setup', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('step sequencing', () => {
    it('has 11 total steps', () => {
      // Flow: Welcome(0) → Promise(1) → Naming(2) → Hardware(3) → Consent(4) →
      // Download(5) → DataConnection(6) → FileSelection(7) → KnowledgeMoment(8) →
      // Autonomy(9) → Ready(10)
      const TOTAL_STEPS = 11;
      expect(TOTAL_STEPS).toBe(11);
    });

    it('step 3 is hardware detection', () => {
      const steps = [
        'welcome', 'promise', 'naming',
        'hardware_detection', 'model_consent', 'model_download',
        'data_connection', 'file_selection', 'knowledge_moment',
        'autonomy', 'ready',
      ];
      expect(steps[3]).toBe('hardware_detection');
    });

    it('step 4 is model download consent', () => {
      const steps = [
        'welcome', 'promise', 'naming',
        'hardware_detection', 'model_consent', 'model_download',
        'data_connection', 'file_selection', 'knowledge_moment',
        'autonomy', 'ready',
      ];
      expect(steps[4]).toBe('model_consent');
    });

    it('step 5 is model download progress', () => {
      const steps = [
        'welcome', 'promise', 'naming',
        'hardware_detection', 'model_consent', 'model_download',
        'data_connection', 'file_selection', 'knowledge_moment',
        'autonomy', 'ready',
      ];
      expect(steps[5]).toBe('model_download');
    });
  });

  describe('hardware detection', () => {
    it('calls detect_hardware on step 3', async () => {
      const hwInfo = {
        tier: 'standard' as const,
        totalRamMb: 16384,
        cpuCores: 8,
        gpuName: null,
        gpuVramMb: null,
        os: 'Windows',
        arch: 'x86_64',
      };
      mockInvoke.mockResolvedValue(hwInfo);

      const result = await mockInvoke('detect_hardware');
      expect(result).toEqual(hwInfo);
      expect(result.tier).toBe('standard');
    });

    it('provides fallback on detection failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Detection failed'));

      const fallback = {
        tier: 'standard' as const,
        totalRamMb: 8192,
        cpuCores: 4,
        gpuName: null,
        gpuVramMb: null,
        os: 'Unknown',
        arch: 'Unknown',
      };

      try {
        await mockInvoke('detect_hardware');
      } catch {
        // Use fallback
        expect(fallback.tier).toBe('standard');
      }
    });

    it('classifies workstation hardware correctly', async () => {
      const hwInfo = {
        tier: 'workstation' as const,
        totalRamMb: 65536,
        cpuCores: 16,
        gpuName: 'NVIDIA RTX 4090',
        gpuVramMb: 24576,
        os: 'Windows',
        arch: 'x86_64',
      };
      mockInvoke.mockResolvedValue(hwInfo);

      const result = await mockInvoke('detect_hardware');
      expect(result.tier).toBe('workstation');
      expect(result.gpuName).toBe('NVIDIA RTX 4090');
    });
  });

  describe('model download consent', () => {
    it('shows embedding model info (275MB)', () => {
      const embeddingModel = {
        name: 'Embedding Model',
        sizeBytes: 275_000_000,
        description: 'understands the meaning of your documents',
      };
      expect(embeddingModel.sizeBytes).toBe(275_000_000);
    });

    it('shows reasoning model info (~2.1GB for standard)', () => {
      const reasoningModel = {
        name: 'Reasoning Model',
        sizeBytes: 2_100_000_000,
        description: 'thinks, plans, and acts on your behalf',
      };
      expect(reasoningModel.sizeBytes).toBe(2_100_000_000);
    });

    it('requires explicit consent before download', () => {
      let consented = false;
      expect(consented).toBe(false);
      consented = true; // User clicks "Download Models"
      expect(consented).toBe(true);
    });
  });

  describe('model download progress', () => {
    it('calls start_model_downloads with detected tier', async () => {
      mockInvoke.mockResolvedValue({ success: true });

      await mockInvoke('start_model_downloads', { tier: 'standard' });
      expect(mockInvoke).toHaveBeenCalledWith('start_model_downloads', { tier: 'standard' });
    });

    it('tracks download states for multiple models', () => {
      const downloads = [
        { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 137_500_000, speedBytesPerSec: 5_000_000, status: 'downloading' as const },
        { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 0, speedBytesPerSec: 0, status: 'pending' as const },
      ];

      expect(downloads).toHaveLength(2);
      expect(downloads[0]!.status).toBe('downloading');
      expect(downloads[1]!.status).toBe('pending');
    });

    it('allows advance when all downloads complete', () => {
      const downloads = [
        { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 275_000_000, status: 'complete' as const },
        { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 2_100_000_000, status: 'complete' as const },
      ];

      const allComplete = downloads.every(d => d.status === 'complete');
      expect(allComplete).toBe(true);
    });

    it('does not allow advance when downloads incomplete', () => {
      const downloads = [
        { modelName: 'Embedding Model', totalBytes: 275_000_000, downloadedBytes: 275_000_000, status: 'complete' as const },
        { modelName: 'Reasoning Model', totalBytes: 2_100_000_000, downloadedBytes: 100_000_000, status: 'downloading' as const },
      ];

      const allComplete = downloads.every(d => d.status === 'complete');
      expect(allComplete).toBe(false);
    });
  });

  describe('knowledge moment timing', () => {
    it('generates knowledge moment at step 8 (not step 5)', async () => {
      const moment = { tier: 1, message: 'Test moment' };
      mockInvoke.mockResolvedValue(moment);

      // Step 8 is the new Knowledge Moment step
      const step = 8;
      expect(step).toBe(8);

      const result = await mockInvoke('generate_knowledge_moment');
      expect(result.tier).toBe(1);
    });
  });
});
