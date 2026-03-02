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
}

export const threadOptions = ['auto', '4', '8', '16'] as const;
export const contextOptions = [4096, 8192, 16384, 32768] as const;
export const contextLabels: Record<number, string> = { 4096: '4K', 8192: '8K', 16384: '16K', 32768: '32K' };
