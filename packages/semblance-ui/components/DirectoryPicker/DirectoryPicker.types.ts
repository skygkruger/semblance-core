export interface DirectoryEntry {
  path: string;
  fileCount?: number;
  lastIndexed?: string;
}

export interface DirectoryPickerProps {
  directories: DirectoryEntry[];
  onAdd: () => void;
  onRemove: (path: string) => void;
  onRescan?: (path: string) => void;
  className?: string;
}
