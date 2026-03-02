import { useCallback } from 'react';
import { Card, DirectoryPicker, ProgressBar } from '@semblance/ui';
import { startIndexing } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';

export function FilesScreen() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  const handleAddFolder = useCallback(async () => {
    try {
      // Use Tauri dialog to pick a directory
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        dispatch({ type: 'ADD_DIRECTORY', path: selected });
        await startIndexing([...state.indexedDirectories, selected]);
      }
    } catch {
      // User cancelled or dialog unavailable
    }
  }, [dispatch, state.indexedDirectories]);

  const handleRemove = useCallback((path: string) => {
    dispatch({ type: 'REMOVE_DIRECTORY', path });
  }, [dispatch]);

  const handleRescan = useCallback(async (path: string) => {
    try {
      await startIndexing([path]);
    } catch {
      // Handle error
    }
  }, []);

  const dirs = state.indexedDirectories.map((path) => ({
    path,
    fileCount: undefined,
    lastIndexed: undefined,
  }));

  const { indexingStatus, knowledgeStats } = state;

  return (
    <div className="max-w-container-lg mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
        Files
      </h1>

      {/* Indexed Directories */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Indexed Directories
        </h2>
        {dirs.length === 0 ? (
          <p className="text-sm text-semblance-text-tertiary mb-4">
            No directories indexed yet. Add a folder to get started.
          </p>
        ) : null}
        <DirectoryPicker
          directories={dirs}
          onAdd={handleAddFolder}
          onRemove={handleRemove}
          onRescan={handleRescan}
        />
      </Card>

      {/* Indexing Status */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Indexing Status
        </h2>
        {indexingStatus.state === 'idle' || indexingStatus.state === 'complete' ? (
          <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            All directories up to date.
            {knowledgeStats.lastIndexedAt && (
              <span className="text-semblance-text-tertiary"> Last completed: {knowledgeStats.lastIndexedAt}</span>
            )}
          </p>
        ) : (
          <div className="space-y-3">
            <ProgressBar
              value={indexingStatus.filesScanned}
              max={indexingStatus.filesTotal || 1}
              indeterminate={indexingStatus.state === 'scanning'}
            />
            <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              {indexingStatus.state === 'scanning' && 'Scanning files...'}
              {indexingStatus.state === 'indexing' && `Indexing: ${indexingStatus.filesScanned}/${indexingStatus.filesTotal} files`}
              {indexingStatus.state === 'error' && (
                <span className="text-semblance-attention">Error: {indexingStatus.error}</span>
              )}
            </p>
          </div>
        )}
      </Card>

      {/* Knowledge Stats */}
      <Card>
        <h2 className="text-md font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark mb-4">
          Knowledge Stats
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold text-semblance-primary">{knowledgeStats.documentCount}</p>
            <p className="text-xs text-semblance-text-tertiary">Documents</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-semblance-primary">{knowledgeStats.chunkCount}</p>
            <p className="text-xs text-semblance-text-tertiary">Chunks</p>
          </div>
          <div>
            <p className="text-sm font-medium text-semblance-text-primary dark:text-semblance-text-primary-dark">
              {(knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1)} MB
            </p>
            <p className="text-xs text-semblance-text-tertiary">Index Size</p>
          </div>
          <div>
            <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              .txt, .md, .pdf, .docx
            </p>
            <p className="text-xs text-semblance-text-tertiary">Supported Types</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
