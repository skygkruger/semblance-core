export interface HardwareInfo {
  tier: 'capable' | 'standard' | 'constrained';
  totalRamMb: number;
  cpuCores: number;
  gpuName: string | null;
  gpuVramMb: number | null;
  os: string;
  arch: string;
}

export interface HardwareDetectionProps {
  hardwareInfo: HardwareInfo | null;
  detecting: boolean;
  onContinue?: () => void;
}
