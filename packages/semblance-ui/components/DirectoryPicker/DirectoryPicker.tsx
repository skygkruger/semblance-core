interface DirectoryEntry {
  path: string;
  fileCount?: number;
  lastIndexed?: string;
}

interface DirectoryPickerProps {
  directories: DirectoryEntry[];
  onAdd: () => void;
  onRemove: (path: string) => void;
  onRescan?: (path: string) => void;
  className?: string;
}

export function DirectoryPicker({ directories, onAdd, onRemove, onRescan, className = '' }: DirectoryPickerProps) {
  return (
    <div className={className}>
      <ul className="space-y-2" role="list">
        {directories.map((dir) => (
          <li
            key={dir.path}
            className="
              flex items-center gap-3 p-3
              bg-semblance-surface-2 dark:bg-semblance-surface-2-dark
              rounded-md
            "
          >
            <svg className="w-5 h-5 text-semblance-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark truncate">
                {dir.path}
              </p>
              <div className="flex gap-3 text-xs text-semblance-text-tertiary mt-0.5">
                {dir.fileCount !== undefined && <span>{dir.fileCount} files</span>}
                {dir.lastIndexed && <span>Last indexed: {dir.lastIndexed}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onRescan && (
                <button
                  type="button"
                  onClick={() => onRescan(dir.path)}
                  className="p-1.5 text-semblance-muted hover:text-semblance-primary rounded-md hover:bg-semblance-surface-1 dark:hover:bg-semblance-surface-1-dark transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus"
                  aria-label={`Re-scan ${dir.path}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => onRemove(dir.path)}
                className="p-1.5 text-semblance-muted hover:text-semblance-attention rounded-md hover:bg-semblance-attention-subtle transition-colors duration-fast focus-visible:outline-none focus-visible:shadow-focus"
                aria-label={`Remove ${dir.path}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="
          mt-3 w-full flex items-center justify-center gap-2 py-2.5
          text-sm font-medium text-semblance-primary
          border border-dashed border-semblance-primary/30
          rounded-md
          hover:bg-semblance-primary-subtle dark:hover:bg-semblance-primary-subtle-dark
          transition-colors duration-fast
          focus-visible:outline-none focus-visible:shadow-focus
        "
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
        Add Folder
      </button>
    </div>
  );
}

export type { DirectoryEntry };
