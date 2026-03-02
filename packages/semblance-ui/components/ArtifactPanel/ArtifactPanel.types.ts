export type ArtifactType = 'markdown' | 'text' | 'code' | 'html' | 'csv' | 'json';

export interface ArtifactItem {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
}

export interface ArtifactPanelProps {
  artifact: ArtifactItem | null;
  open: boolean;
  onClose: () => void;
  onDownload?: (artifact: ArtifactItem) => void;
}
