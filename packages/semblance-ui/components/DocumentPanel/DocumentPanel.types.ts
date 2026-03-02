export type AttachmentStatus = 'pending' | 'processing' | 'ready' | 'error';

export interface DocumentPanelFile {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  error?: string;
  addedToKnowledge: boolean;
}

export interface DocumentPanelProps {
  files: DocumentPanelFile[];
  open: boolean;
  onClose: () => void;
  onRemoveFile: (id: string) => void;
  onAddToKnowledge: (id: string) => void;
  onAttach: () => void;
}
