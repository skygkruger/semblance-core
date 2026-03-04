import { useCallback, useEffect, useState } from 'react';
import { Button, SkeletonCard } from '@semblance/ui';
import { cloudStorageBrowseFolders } from '../ipc/commands';
import type { CloudFolder } from '../ipc/types';
import '@semblance/ui/components/Settings/Settings.css';
import './CloudFolderPicker.css';

interface CloudFolderPickerProps {
  provider: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folders: Array<{ folderId: string; folderName: string }>) => void;
  selectedFolderIds?: string[];
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
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
    <div className="folder-picker__overlay">
      <div className="settings-screen folder-picker__panel">
        <div className="settings-header">
          <button type="button" className="settings-header__back" onClick={onClose}>
            <BackArrow />
          </button>
          <h1 className="settings-header__title">Select Folders</h1>
        </div>

        <div className="folder-picker__breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id ?? 'root'}>
              {i > 0 && <span className="folder-picker__breadcrumb-sep">/</span>}
              <button
                type="button"
                onClick={() => handleBreadcrumbClick(i)}
                className="folder-picker__breadcrumb-btn"
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>

        <div className="folder-picker__body">
          {loading ? (
            <SkeletonCard variant="generic" message="Loading folders" height={140} />
          ) : folders.length === 0 ? (
            <SkeletonCard variant="generic" message="No folders found" showSpinner={false} height={140} />
          ) : (
            <div className="folder-picker__list">
              {folders.map(folder => (
                <div key={folder.id} className="folder-picker__row">
                  <input
                    type="checkbox"
                    checked={selected.has(folder.id)}
                    onChange={() => toggleSelect(folder.id)}
                    className="folder-picker__checkbox"
                  />
                  <button
                    type="button"
                    onClick={() => handleNavigate(folder)}
                    className="folder-picker__folder-btn"
                  >
                    {folder.name}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="folder-picker__footer">
          <label className="folder-picker__subfolder-label">
            <input
              type="checkbox"
              checked={includeSubfolders}
              onChange={(e) => setIncludeSubfolders(e.target.checked)}
              className="folder-picker__checkbox"
            />
            Include subfolders
          </label>
          <div className="folder-picker__footer-actions">
            <Button variant="dismiss" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="approve" size="sm" onClick={handleConfirm} disabled={selected.size === 0}>
              Add {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
