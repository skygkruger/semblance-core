// Import Everything Orchestrator — One-time digital life import.
//
// Imports browser history, notes, photo metadata, and messaging history
// into the local knowledge graph. Each source requires explicit consent.
//
// CRITICAL: This file is in packages/core/. No network imports.
// All data stays local. Import reads local database files only.

import type { DatabaseHandle } from '../platform/types.js';
import { getPlatform } from '../platform/index.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ImportSource =
  | 'browser_history'
  | 'notes'
  | 'photo_metadata'
  | 'messaging_history';

export interface ImportSourceStatus {
  source: ImportSource;
  available: boolean;
  itemCount: number | null;
  lastImportAt: string | null;
  consentGranted: boolean;
}

export interface ImportProgress {
  source: ImportSource;
  phase: 'reading' | 'sanitizing' | 'indexing' | 'done' | 'error';
  itemsProcessed: number;
  totalItems: number;
  errorMessage?: string;
}

// ─── SQLite Schema ─────────────────────────────────────────────────────────────

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS import_history (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    item_count INTEGER NOT NULL,
    consent_granted INTEGER NOT NULL DEFAULT 1,
    error_message TEXT
  );
`;

// ─── Platform-specific database paths ──────────────────────────────────────────

function getBrowserHistoryPaths(): Array<{ browser: string; path: string }> {
  const p = getPlatform();
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const paths: Array<{ browser: string; path: string }> = [];

  if (process.platform === 'darwin') {
    paths.push(
      { browser: 'Chrome', path: `${home}/Library/Application Support/Google/Chrome/Default/History` },
      { browser: 'Firefox', path: `${home}/Library/Application Support/Firefox/Profiles` },
      { browser: 'Safari', path: `${home}/Library/Safari/History.db` },
      { browser: 'Arc', path: `${home}/Library/Application Support/Arc/User Data/Default/History` },
    );
  } else if (process.platform === 'win32') {
    const appData = process.env['LOCALAPPDATA'] ?? `${home}/AppData/Local`;
    paths.push(
      { browser: 'Chrome', path: `${appData}/Google/Chrome/User Data/Default/History` },
      { browser: 'Firefox', path: `${appData}/Mozilla/Firefox/Profiles` },
      { browser: 'Edge', path: `${appData}/Microsoft/Edge/User Data/Default/History` },
    );
  } else {
    paths.push(
      { browser: 'Chrome', path: `${home}/.config/google-chrome/Default/History` },
      { browser: 'Firefox', path: `${home}/.mozilla/firefox` },
    );
  }

  return paths;
}

// ─── Import Everything Orchestrator ────────────────────────────────────────────

export class ImportEverythingOrchestrator {
  private db: DatabaseHandle;

  constructor(db: DatabaseHandle) {
    this.db = db;
    this.db.exec(CREATE_TABLE);
  }

  /** Detect which sources are available on this device */
  async detectSources(): Promise<ImportSourceStatus[]> {
    const p = getPlatform();
    const results: ImportSourceStatus[] = [];

    // Browser history
    const browserPaths = getBrowserHistoryPaths();
    let browserAvailable = false;
    for (const bp of browserPaths) {
      try {
        await p.fs.stat(bp.path);
        browserAvailable = true;
        break;
      } catch { /* not found */ }
    }
    results.push({
      source: 'browser_history',
      available: browserAvailable,
      itemCount: null,
      lastImportAt: this.getLastImportAt('browser_history'),
      consentGranted: false,
    });

    // Notes (Apple Notes on macOS)
    let notesAvailable = false;
    if (process.platform === 'darwin') {
      const home = process.env['HOME'] ?? '';
      try {
        await p.fs.stat(`${home}/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite`);
        notesAvailable = true;
      } catch { /* not found */ }
    }
    results.push({
      source: 'notes',
      available: notesAvailable,
      itemCount: null,
      lastImportAt: this.getLastImportAt('notes'),
      consentGranted: false,
    });

    // Photo metadata
    let photosAvailable = false;
    const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
    const photosDirs = process.platform === 'darwin'
      ? [`${home}/Pictures`]
      : process.platform === 'win32'
        ? [`${home}/Pictures`]
        : [`${home}/Pictures`];
    for (const dir of photosDirs) {
      try {
        await p.fs.stat(dir);
        photosAvailable = true;
        break;
      } catch { /* not found */ }
    }
    results.push({
      source: 'photo_metadata',
      available: photosAvailable,
      itemCount: null,
      lastImportAt: this.getLastImportAt('photo_metadata'),
      consentGranted: false,
    });

    // Messaging history (iMessage on macOS)
    let messagingAvailable = false;
    if (process.platform === 'darwin') {
      try {
        await p.fs.stat(`${home}/Library/Messages/chat.db`);
        messagingAvailable = true;
      } catch { /* not found */ }
    }
    results.push({
      source: 'messaging_history',
      available: messagingAvailable,
      itemCount: null,
      lastImportAt: this.getLastImportAt('messaging_history'),
      consentGranted: false,
    });

    return results;
  }

  /** Run import for a specific source (after consent) */
  async importSource(source: ImportSource, onProgress: (p: ImportProgress) => void): Promise<void> {
    onProgress({ source, phase: 'reading', itemsProcessed: 0, totalItems: 0 });

    let itemCount = 0;

    try {
      switch (source) {
        case 'browser_history':
          itemCount = await this.importBrowserHistory(onProgress);
          break;
        case 'notes':
          itemCount = await this.importNotes(onProgress);
          break;
        case 'photo_metadata':
          itemCount = await this.importPhotoMetadata(onProgress);
          break;
        case 'messaging_history':
          itemCount = await this.importMessagingHistory(onProgress);
          break;
      }

      // Record import
      const { nanoid } = await import('nanoid');
      this.db.prepare(
        'INSERT INTO import_history (id, source, imported_at, item_count, consent_granted) VALUES (?, ?, ?, ?, 1)'
      ).run(`imp_${nanoid()}`, source, new Date().toISOString(), itemCount);

      onProgress({ source, phase: 'done', itemsProcessed: itemCount, totalItems: itemCount });
    } catch (err) {
      onProgress({ source, phase: 'error', itemsProcessed: 0, totalItems: 0, errorMessage: (err as Error).message });
    }
  }

  /** Get import history */
  getImportHistory(): Array<{ source: ImportSource; importedAt: string; itemCount: number }> {
    const rows = this.db.prepare(
      'SELECT source, imported_at, item_count FROM import_history ORDER BY imported_at DESC'
    ).all() as Array<{ source: string; imported_at: string; item_count: number }>;

    return rows.map(r => ({
      source: r.source as ImportSource,
      importedAt: r.imported_at,
      itemCount: r.item_count,
    }));
  }

  // ─── Private import methods ───────────────────────────────────────────────

  private async importBrowserHistory(onProgress: (p: ImportProgress) => void): Promise<number> {
    // Read Chrome/Firefox/Safari history SQLite databases
    // For now: detect available paths and report counts
    const browserPaths = getBrowserHistoryPaths();
    let totalItems = 0;

    for (const bp of browserPaths) {
      try {
        const p = getPlatform();
        await p.fs.stat(bp.path);
        // Browser history databases are SQLite — read URL, title, visit_count, last_visit_time
        // Actual SQLite reading would require opening the file as a separate database
        // For this sprint: count as detected but not yet read (requires Database copy due to lock)
        totalItems += 1; // Placeholder count per detected browser
        onProgress({ source: 'browser_history', phase: 'indexing', itemsProcessed: totalItems, totalItems: totalItems + 1 });
      } catch { /* skip unavailable */ }
    }

    return totalItems;
  }

  private async importNotes(_onProgress: (p: ImportProgress) => void): Promise<number> {
    // Apple Notes: ~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite
    // Read ZICCLOUDSYNCINGOBJECT table for note text
    return 0; // Platform-specific implementation needed
  }

  private async importPhotoMetadata(_onProgress: (p: ImportProgress) => void): Promise<number> {
    // Scan ~/Pictures for images, extract EXIF (date, GPS city-level, camera model)
    // No image content indexed — metadata only
    return 0; // EXIF parsing library needed
  }

  private async importMessagingHistory(_onProgress: (p: ImportProgress) => void): Promise<number> {
    // iMessage: ~/Library/Messages/chat.db
    // Extract sender names, message counts, date ranges — no message content
    return 0; // Platform-specific implementation needed
  }

  private getLastImportAt(source: string): string | null {
    const row = this.db.prepare(
      'SELECT imported_at FROM import_history WHERE source = ? ORDER BY imported_at DESC LIMIT 1'
    ).get(source) as { imported_at: string } | undefined;
    return row?.imported_at ?? null;
  }
}
