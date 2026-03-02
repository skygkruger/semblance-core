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
}
