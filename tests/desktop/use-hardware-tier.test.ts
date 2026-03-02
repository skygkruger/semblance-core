// @vitest-environment jsdom
/**
 * Desktop useHardwareTier Hook Tests
 *
 * Tests the hook that detects hardware capability and caches the result.
 * Uses the mock-tauri invoke to simulate IPC responses.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHardwareTier, _resetHardwareTierCache } from '../../packages/desktop/src/hooks/useHardwareTier';
import { invoke, clearInvokeMocks } from '../helpers/mock-tauri';

function mockHardware(overrides: Record<string, unknown> = {}) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'detect_hardware') return {
      tier: 'standard',
      totalRamMb: 16384,
      cpuCores: 8,
      gpuName: null,
      gpuVramMb: null,
      os: 'Windows',
      arch: 'x86_64',
      voiceCapable: true,
      ...overrides,
    };
    return null;
  });
}

describe('useHardwareTier (desktop)', () => {
  beforeEach(() => {
    clearInvokeMocks();
    _resetHardwareTierCache();
  });

  it('returns voiceCapable=true for standard+ tier with 8GB+', async () => {
    mockHardware({ tier: 'standard', totalRamMb: 8192, voiceCapable: true });
    const { result } = renderHook(() => useHardwareTier());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.voiceCapable).toBe(true);
    expect(result.current.tier).toBe('standard');
    expect(result.current.totalRamMb).toBe(8192);
  });

  it('returns voiceCapable=false for constrained tier', async () => {
    mockHardware({ tier: 'constrained', totalRamMb: 4096, voiceCapable: false });
    const { result } = renderHook(() => useHardwareTier());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.voiceCapable).toBe(false);
    expect(result.current.tier).toBe('constrained');
  });

  it('caches result on subsequent renders', async () => {
    mockHardware({ tier: 'performance', totalRamMb: 16384, voiceCapable: true });

    const { result: first } = renderHook(() => useHardwareTier());
    await waitFor(() => expect(first.current.loading).toBe(false));

    // Second render — should use cache, not invoke again
    const callCountBefore = invoke.mock.calls.length;
    const { result: second } = renderHook(() => useHardwareTier());

    // Cached result should be available immediately (no loading state)
    expect(second.current.loading).toBe(false);
    expect(second.current.voiceCapable).toBe(true);
    expect(second.current.tier).toBe('performance');

    // No additional invoke calls
    expect(invoke.mock.calls.length).toBe(callCountBefore);
  });
});
