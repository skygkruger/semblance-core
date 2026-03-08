export interface HardwareInfo {
  tier: 'workstation' | 'performance' | 'capable' | 'standard' | 'constrained';
  totalRamMb: number;
  cpuCores: number;
  gpuName: string | null;
  gpuVramMb: number | null;
  os: string;
  arch: string;
  voiceCapable: boolean;
}

export interface HardwareDetectionProps {
  hardwareInfo: HardwareInfo | null;
  detecting: boolean;
  onContinue?: () => void;
}
