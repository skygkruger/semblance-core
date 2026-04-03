// Hardware Detection Types — Profiles, tiers, and GPU classification.
// Used by InferenceRouter for model selection and NativeRuntime configuration.
// CRITICAL: No network imports. Pure types.

export type HardwareProfileTier = 'constrained' | 'standard' | 'performance' | 'workstation' | 'enthusiast';

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
  /** Whether this device has enough resources to run Whisper.cpp for local STT */
  voiceCapable: boolean;
}

/**
 * Classify a hardware profile into a tier based on available resources.
 * Tiers determine which models are recommended and how inference is configured.
 *
 * - constrained: <8GB RAM — smallest models only
 * - standard: 8–15GB RAM — 4B parameter models
 * - performance: 16–31GB RAM — 8B parameter models
 * - workstation: 32GB+ RAM or discrete GPU with ≥8GB dedicated VRAM
 * - enthusiast: NEVER auto-detected. Opt-in only via user Settings.
 *   Intended for 64GB+ systems or discrete GPU with ≥24GB VRAM.
 *
 * GPU VRAM only promotes tier for discrete GPUs (nvidia/amd) where VRAM is a
 * separate memory pool. Apple Silicon unified memory does NOT qualify — the GPU
 * shares the same RAM pool, so a 16GB MacBook Air reporting 12GB "VRAM" must
 * not be promoted to workstation (which would recommend a 17GB model).
 */
export function classifyHardware(totalRamMb: number, gpu: GpuInfo | null): HardwareProfileTier {
  const ramGb = totalRamMb / 1024;

  // Discrete GPU with ≥8GB dedicated VRAM can promote to workstation
  // regardless of system RAM (e.g., 16GB RAM + RTX 4070 12GB).
  // Unified memory (Apple Silicon) does NOT qualify.
  const hasDiscreteGpuPromotion = gpu != null
    && gpu.computeCapable
    && gpu.vramMb >= 8192
    && gpu.vendor !== 'apple'; // unified memory — not a separate pool

  if (ramGb >= 32 || hasDiscreteGpuPromotion) {
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
 * Determine whether a device can run Whisper.cpp for local speech-to-text.
 * Desktop requires 8GB+ RAM and non-constrained tier.
 * Mobile requires 4GB+ RAM.
 */
export function isVoiceCapable(
  totalRamMb: number,
  tier: HardwareProfileTier,
  platform: 'desktop' | 'mobile',
): boolean {
  if (platform === 'mobile') return totalRamMb >= 4096;
  return totalRamMb >= 8192 && tier !== 'constrained';
}

/**
 * Describe a hardware tier in plain language for the user.
 */
export function describeTier(tier: HardwareProfileTier): string {
  switch (tier) {
    case 'enthusiast':
      return 'Enthusiast system — frontier models with maximum quality and context';
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
