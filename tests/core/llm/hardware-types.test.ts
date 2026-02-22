// Tests for Hardware Types — tier classification, profile description.

import { describe, it, expect } from 'vitest';
import {
  classifyHardware,
  describeTier,
  describeProfile,
} from '@semblance/core/llm/hardware-types.js';
import type { HardwareProfile, GpuInfo } from '@semblance/core/llm/hardware-types.js';

describe('classifyHardware', () => {
  it('classifies < 8GB RAM as constrained', () => {
    expect(classifyHardware(6 * 1024, null)).toBe('constrained');
    expect(classifyHardware(4 * 1024, null)).toBe('constrained');
    expect(classifyHardware(2 * 1024, null)).toBe('constrained');
  });

  it('classifies 8-15GB RAM as standard', () => {
    expect(classifyHardware(8 * 1024, null)).toBe('standard');
    expect(classifyHardware(12 * 1024, null)).toBe('standard');
    expect(classifyHardware(15 * 1024, null)).toBe('standard');
  });

  it('classifies 16-31GB RAM as performance', () => {
    expect(classifyHardware(16 * 1024, null)).toBe('performance');
    expect(classifyHardware(24 * 1024, null)).toBe('performance');
    expect(classifyHardware(31 * 1024, null)).toBe('performance');
  });

  it('classifies 32GB+ RAM as workstation', () => {
    expect(classifyHardware(32 * 1024, null)).toBe('workstation');
    expect(classifyHardware(64 * 1024, null)).toBe('workstation');
    expect(classifyHardware(128 * 1024, null)).toBe('workstation');
  });

  it('promotes to workstation with 8GB+ VRAM GPU regardless of RAM', () => {
    const gpu: GpuInfo = {
      name: 'RTX 4070',
      vendor: 'nvidia',
      vramMb: 12288,
      computeCapable: true,
    };
    expect(classifyHardware(16 * 1024, gpu)).toBe('workstation');
  });

  it('does not promote with non-compute-capable GPU', () => {
    const gpu: GpuInfo = {
      name: 'Intel UHD',
      vendor: 'intel',
      vramMb: 2048,
      computeCapable: false,
    };
    expect(classifyHardware(12 * 1024, gpu)).toBe('standard');
  });

  it('does not promote with small VRAM GPU', () => {
    const gpu: GpuInfo = {
      name: 'GTX 1050',
      vendor: 'nvidia',
      vramMb: 4096,
      computeCapable: true,
    };
    expect(classifyHardware(12 * 1024, gpu)).toBe('standard');
  });
});

describe('describeTier', () => {
  it('returns description for each tier', () => {
    expect(describeTier('constrained')).toContain('lightweight');
    expect(describeTier('standard')).toContain('compact');
    expect(describeTier('performance')).toContain('mid-size');
    expect(describeTier('workstation')).toContain('full-size');
  });
});

describe('describeProfile', () => {
  it('formats a profile with GPU', () => {
    const profile: HardwareProfile = {
      tier: 'workstation',
      cpuCores: 12,
      cpuArch: 'x64',
      totalRamMb: 32768,
      availableRamMb: 24576,
      os: 'windows',
      gpu: { name: 'RTX 4090', vendor: 'nvidia', vramMb: 24576, computeCapable: true },
    };
    const desc = describeProfile(profile);
    expect(desc).toContain('12 CPU cores');
    expect(desc).toContain('32GB RAM');
    expect(desc).toContain('RTX 4090');
    expect(desc).toContain('windows');
  });

  it('formats a profile without GPU', () => {
    const profile: HardwareProfile = {
      tier: 'standard',
      cpuCores: 8,
      cpuArch: 'arm64',
      totalRamMb: 8192,
      availableRamMb: 4096,
      os: 'macos',
      gpu: null,
    };
    const desc = describeProfile(profile);
    expect(desc).toContain('8 CPU cores');
    expect(desc).toContain('8GB RAM');
    expect(desc).toContain('No dedicated GPU');
    expect(desc).toContain('macos');
  });
});
