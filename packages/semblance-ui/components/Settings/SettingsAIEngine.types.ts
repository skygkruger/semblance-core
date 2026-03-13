export interface BitNetModelInfo {
  id: string;
  displayName: string;
  family: string;
  parameterCount: string;
  fileSizeBytes: number;
  ramRequiredMb: number;
  license: string;
  nativeOneBit: boolean;
  contextLength: number;
  isDownloaded: boolean;
  isRecommended: boolean;
}

export interface SettingsAIEngineProps {
  modelName: string;
  modelSize: string;
  hardwareProfile: string;
  isModelRunning: boolean;
  inferenceThreads: number | 'auto';
  contextWindow: 4096 | 8192 | 16384 | 32768;
  gpuAcceleration: boolean;
  customModelPath: string | null;
  onChange: (key: string, value: unknown) => void;
  onBack: () => void;

  /** BitNet model management */
  bitnetModels: BitNetModelInfo[];
  bitnetActiveModelId: string | null;
  bitnetDownloadingModelId: string | null;
  bitnetDownloadProgress: number;
  onBitNetDownload: (modelId: string) => void;
  onBitNetActivate: (modelId: string) => void;
}

export const threadOptions = ['auto', '4', '8', '16'] as const;
export const contextOptions = [4096, 8192, 16384, 32768] as const;
export const contextLabels: Record<number, string> = { 4096: '4K', 8192: '8K', 16384: '16K', 32768: '32K' };
