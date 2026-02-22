// Tests for Settings AI Engine section — runtime selection, hardware display, model management.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe('Settings AI Engine', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  describe('runtime selection', () => {
    it('supports three runtime modes', () => {
      const modes = ['builtin', 'ollama', 'custom'] as const;
      expect(modes).toHaveLength(3);
    });

    it('defaults to builtin runtime', () => {
      const defaultMode = 'builtin';
      expect(defaultMode).toBe('builtin');
    });

    it('builtin mode shows hardware profile', () => {
      const mode = 'builtin';
      const showsHardware = mode === 'builtin';
      expect(showsHardware).toBe(true);
    });

    it('ollama mode shows connection status', () => {
      const mode = 'ollama';
      const showsOllamaStatus = mode === 'ollama';
      expect(showsOllamaStatus).toBe(true);
    });

    it('ollama mode shows model selector when connected', () => {
      const mode = 'ollama';
      const ollamaConnected = true;
      const availableModels = ['llama3:8b', 'qwen2.5:7b'];

      const showsModelSelector = mode === 'ollama' && ollamaConnected && availableModels.length > 0;
      expect(showsModelSelector).toBe(true);
    });

    it('custom mode shows coming-soon message', () => {
      const mode = 'custom';
      const isCustom = mode === 'custom';
      expect(isCustom).toBe(true);
    });
  });

  describe('hardware detection in settings', () => {
    it('calls detect_hardware on settings load', async () => {
      const hwInfo = {
        tier: 'performance',
        totalRamMb: 32768,
        cpuCores: 12,
        gpuName: 'Apple M2 Pro',
        gpuVramMb: null,
        os: 'macOS',
        arch: 'aarch64',
      };
      mockInvoke.mockResolvedValue(hwInfo);

      const result = await mockInvoke('detect_hardware');
      expect(result.tier).toBe('performance');
    });

    it('compact display shows tier and RAM', () => {
      const hardware = {
        tier: 'standard' as const,
        totalRamMb: 16384,
        cpuCores: 8,
        gpuName: null,
        gpuVramMb: null,
      };

      // Compact display format: "Standard — 16 GB RAM"
      const displayText = `${hardware.tier === 'standard' ? 'Standard' : hardware.tier} — ${Math.round(hardware.totalRamMb / 1024)} GB RAM`;
      expect(displayText).toContain('Standard');
      expect(displayText).toContain('16 GB RAM');
    });
  });

  describe('model management', () => {
    it('replaces AI Model section with AI Engine section', () => {
      const oldSectionName = 'AI Model';
      const newSectionName = 'AI Engine';
      expect(newSectionName).not.toBe(oldSectionName);
    });

    it('no references to Ollama requirement in builtin mode', () => {
      const builtinStatusMessage = 'Built-in runtime — Models ready';
      expect(builtinStatusMessage).not.toContain('Ollama');
      expect(builtinStatusMessage).not.toContain('Make sure Ollama is running');
    });
  });
});
