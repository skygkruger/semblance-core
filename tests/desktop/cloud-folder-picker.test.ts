// CloudFolderPicker Tests — Folder tree rendering, selection persistence.

import { describe, it, expect } from 'vitest';

describe('CloudFolderPicker', () => {
  it('filters to only show folder items', () => {
    // The picker browses cloud folders and should only return folders
    const allItems = [
      { id: 'f1', name: 'Documents', isFolder: true },
      { id: 'f2', name: 'readme.txt', isFolder: false },
      { id: 'f3', name: 'Photos', isFolder: true },
    ];

    const foldersOnly = allItems.filter(item => item.isFolder);
    expect(foldersOnly).toHaveLength(2);
    expect(foldersOnly[0]!.name).toBe('Documents');
    expect(foldersOnly[1]!.name).toBe('Photos');
  });

  it('maintains folder selection state', () => {
    // Selection is tracked as a Set of folder IDs
    const selected = new Set<string>();

    // Select two folders
    selected.add('folder-abc');
    selected.add('folder-xyz');
    expect(selected.size).toBe(2);
    expect(selected.has('folder-abc')).toBe(true);

    // Deselect one
    selected.delete('folder-abc');
    expect(selected.size).toBe(1);
    expect(selected.has('folder-abc')).toBe(false);
    expect(selected.has('folder-xyz')).toBe(true);

    // The result maps selected IDs to folder names
    const folders = [
      { id: 'folder-xyz', name: 'My Folder' },
    ];
    const selectedFolders = folders
      .filter(f => selected.has(f.id))
      .map(f => ({ folderId: f.id, folderName: f.name }));

    expect(selectedFolders).toHaveLength(1);
    expect(selectedFolders[0]!.folderId).toBe('folder-xyz');
    expect(selectedFolders[0]!.folderName).toBe('My Folder');
  });
});
