// Hardware Detection Types — Profiles, tiers, and GPU classification.
// Used by InferenceRouter for model selection and NativeRuntime configuration.
// CRITICAL: No network imports. Pure types.

export type HardwareProfileTier = 'constrained' | 'standard' | 'performance' | 'workstation';

export interface GpuInfo {
  name: string;
  vendor: 'nvidia' | 'amd' | 'apple' | 'intel' | 'unknown';
  vramMb: number;
  /** Whether GPU compute (CUDA/Metal/Vulkan) is likely available */
  computeCapable: boolean;
}

export interface HardwareProfile {
  tier: HardwareProfileTier;
  cpuCores: number;
  cpuArch: 'x64' | 'arm64' | 'unknown';
  totalRamMb: number;
  availableRamMb: number;
  os: 'windows' | 'macos' | 'linux' | 'unknown';
  gpu: GpuInfo | null;
}

/**
 * Classify a hardware profile into a tier based on available resources.
 * Tiers determine which models are recommended and how inference is configured.
 *
 * - constrained: <8GB RAM — smallest models only
 * - standard: 8–15GB RAM — 3B parameter models
 * - performance: 16–31GB RAM — 7B parameter models
 * - workstation: 32GB+ RAM — 8B+ parameter models with GPU acceleration
 */
export function classifyHardware(totalRamMb: number, gpu: GpuInfo | null): HardwareProfileTier {
  const ramGb = totalRamMb / 1024;

  if (ramGb >= 32 || (gpu && gpu.computeCapable && gpu.vramMb >= 8192)) {
    return 'workstation';
  }
  if (ramGb >= 16) {
    return 'performance';
  }
  if (ramGb >= 8) {
    return 'standard';
  }
  return 'constrained';
}

/**
 * Describe a hardware tier in plain language for the user.
 */
export function describeTier(tier: HardwareProfileTier): string {
  switch (tier) {
    case 'workstation':
      return 'High-performance system — full-size models with GPU acceleration';
    case 'performance':
      return 'Capable system — mid-size models with good speed';
    case 'standard':
      return 'Standard system — compact models balanced for speed and quality';
    case 'constrained':
      return 'Resource-limited system — lightweight models for basic functionality';
  }
}

/**
 * Describe a hardware profile in plain language for the onboarding screen.
 */
export function describeProfile(profile: HardwareProfile): string {
  const ramGb = Math.round(profile.totalRamMb / 1024);
  const gpu = profile.gpu
    ? `${profile.gpu.name} (${Math.round(profile.gpu.vramMb / 1024)}GB VRAM)`
    : 'No dedicated GPU';
  return `${profile.cpuCores} CPU cores, ${ramGb}GB RAM, ${gpu}, ${profile.os}`;
}
