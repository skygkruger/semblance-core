export interface ModelDownload {
  modelName: string;
  totalBytes: number;
  downloadedBytes: number;
  speedBytesPerSec: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}

export interface KnowledgeMomentData {
  title: string;
  summary: string;
  connections: string[];
}

export interface InitializeStepProps {
  downloads: ModelDownload[];
  knowledgeMoment: KnowledgeMomentData | null;
  loading: boolean;
  onComplete?: () => void;
  aiName?: string;
  /** When true, the NativeRuntime has loaded the reasoning model and is ready. */
  runtimeReady?: boolean;
}
