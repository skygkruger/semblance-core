import { useCallback, useEffect, useState } from 'react';
import { Button } from '@semblance/ui';
import { cloudStorageBrowseFolders } from '../ipc/commands';
import type { CloudFolder } from '../ipc/types';

interface CloudFolderPickerProps {
  provider: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folders: Array<{ folderId: string; folderName: string }>) => void;
  selectedFolderIds?: string[];
}

export function CloudFolderPicker({ provider, isOpen, onClose, onSelect, selectedFolderIds = [] }: CloudFolderPickerProps) {
  const [folders, setFolders] = useState<CloudFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([{ id: null, name: 'My Drive' }]);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedFolderIds));
  const [includeSubfolders, setIncludeSubfolders] = useState(true);

  const loadFolders = useCallback(async (parentId: string | null) => {
    setLoading(true);
    try {
      const result = await cloudStorageBrowseFolders(provider, parentId ?? 'root');
      setFolders(result);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    if (isOpen) {
      loadFolders(currentFolderId);
    }
  }, [isOpen, currentFolderId, loadFolders]);

  const handleNavigate = useCallback((folder: CloudFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
  }, []);

  const handleBreadcrumbClick = useCallback((index: number) => {
    const crumb = breadcrumbs[index];
    if (!crumb) return;
    setCurrentFolderId(crumb.id);
    setBreadcrumbs(prev => prev.slice(0, index + 1));
  }, [breadcrumbs]);

  const toggleSelect = useCallback((folderId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selectedFolders = folders
      .filter(f => selected.has(f.id))
      .map(f => ({ folderId: f.id, folderName: f.name }));
    onSelect(selectedFolders);
    onClose();
  }, [folders, selected, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-semblance-surface dark:bg-semblance-surface-dark rounded-lg shadow-lg w-full max-w-md max-h-[70vh] flex flex-col">
        <div className="p-4 border-b border-semblance-border dark:border-semblance-border-dark">
          <h3 className="text-sm font-semibold text-semblance-text-primary dark:text-semblance-text-primary-dark">
            Select Folders to Sync
          </h3>
          <div className="flex gap-1 mt-2 text-xs text-semblance-text-tertiary overflow-x-auto">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id ?? 'root'}>
                {i > 0 && <span className="mx-1">/</span>}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(i)}
                  className="hover:text-semblance-primary"
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-xs text-semblance-text-tertiary p-4 text-center">Loading folders...</p>
          ) : folders.length === 0 ? (
            <p className="text-xs text-semblance-text-tertiary p-4 text-center">No folders found</p>
          ) : (
            <div className="space-y-1">
              {folders.map(folder => (
                <div
                  key={folder.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-semblance-surface-1 dark:hover:bg-semblance-surface-1-dark"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(folder.id)}
                    onChange={() => toggleSelect(folder.id)}
                    className="rounded border-semblance-border"
                  />
                  <button
                    type="button"
                    onClick={() => handleNavigate(folder)}
                    className="flex-1 text-left text-sm text-semblance-text-primary dark:text-semblance-text-primary-dark hover:text-semblance-primary truncate"
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-semblance-border dark:border-semblance-border-dark">
          <label className="flex items-center gap-2 mb-3 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) => setIncludeSubfolders(e.target.checked)}
              className="rounded border-semblance-border"
            />
            Include subfolders
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleConfirm} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
