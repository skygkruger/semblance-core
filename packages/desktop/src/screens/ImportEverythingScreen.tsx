/**
 * ImportEverythingScreen — Import user's digital life into the local knowledge graph.
 * DR-gated: requires Digital Representative license.
 * Backend handlers: import_detect_sources, import_run_source, import_everything_get_history.
 *
 * Thin data wrapper — delegates rendering to ImportDigitalLifeView.
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SkeletonCard } from '@semblance/ui';
import { sidecarCall } from '../ipc/commands';
import { useLicense } from '../contexts/LicenseContext';
import {
  ImportDigitalLifeView,
  type ImportSource as ViewImportSource,
  type ImportHistoryEntry,
  type ImportProgress as ViewImportProgress,
  DEFAULT_IMPORT_SOURCES,
} from '../components/ImportDigitalLifeView';

// ─── IPC response shapes ────────────────────────────────────────────────────

interface ImportSourceRaw {
  id: string;
  name: string;
  type: string;
  path?: string;
  size?: number;
}

interface ImportHistoryRecord {
  source: string;
  timestamp: string;
  itemsImported: number;
  status: 'success' | 'partial' | 'failed';
}

interface ImportProgressEvent {
  source: string;
  current: number;
  total: number;
  phase?: string;
}

// ─── Mappers ────────────────────────────────────────────────────────────────

/** Map raw IPC sources to view component shape, merging with defaults where possible. */
function mapSources(raw: ImportSourceRaw[]): ViewImportSource[] {
  return raw.map((src) => {
    // Try to find a matching default source for richer metadata
    const defaultMatch = DEFAULT_IMPORT_SOURCES.find((d) => d.id === src.id);
    if (defaultMatch) return defaultMatch;

    return {
      id: src.id,
      name: src.name,
      description: src.type + (src.path ? ` · ${src.path}` : ''),
      formats: src.type,
      consentText: 'This data will be indexed locally. Nothing leaves your device.',
      icon: 'file',
    };
  });
}

function mapHistory(records: ImportHistoryRecord[]): ImportHistoryEntry[] {
  return records.map((r, i) => ({
    id: `${r.source}-${i}`,
    sourceType: r.source,
    format: '',
    importedAt: r.timestamp,
    itemCount: r.itemsImported,
    status: r.status,
  }));
}

function mapProgress(
  event: ImportProgressEvent | null,
  isImporting: boolean,
): ViewImportProgress | null {
  if (!event || !isImporting) return null;
  return {
    phase: event.phase ?? 'Importing',
    itemsProcessed: event.current,
    totalItems: event.total,
    isActive: true,
  };
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export function ImportEverythingScreen() {
  const license = useLicense();
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<ImportSourceRaw[]>([]);
  const [history, setHistory] = useState<ImportHistoryRecord[]>([]);
  const [importingSource, setImportingSource] = useState<string | null>(null);
  const [progressEvent, setProgressEvent] = useState<ImportProgressEvent | null>(null);

  // Load history on mount
  useEffect(() => {
    setLoading(true);
    sidecarCall<ImportHistoryRecord[]>('import_everything_get_history')
      .then((hist) => {
        if (Array.isArray(hist)) setHistory(hist);
      })
      .catch((err) => console.error('[ImportEverythingScreen] Failed to load history:', err))
      .finally(() => setLoading(false));
  }, []);

  // Listen for import progress events
  useEffect(() => {
    const unlisten = listen<ImportProgressEvent>('import:progress', (event) => {
      setProgressEvent(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Auto-detect sources on mount for premium users
  useEffect(() => {
    if (!license.isPremium) return;
    sidecarCall<ImportSourceRaw[]>('import_detect_sources')
      .then((detected) => {
        if (Array.isArray(detected)) setSources(detected);
      })
      .catch((err) => console.error('[ImportEverythingScreen] Failed to detect sources:', err));
  }, [license.isPremium]);

  const handleImport = useCallback(async (sourceId: string) => {
    setImportingSource(sourceId);
    setProgressEvent(null);
    try {
      await sidecarCall<{ success: boolean }>('import_run_source', { source: sourceId });
      // Refresh history after import
      const hist = await sidecarCall<ImportHistoryRecord[]>('import_everything_get_history');
      if (Array.isArray(hist)) setHistory(hist);
    } catch (err) {
      console.error('[ImportEverythingScreen] Import failed:', err);
    } finally {
      setImportingSource(null);
      setProgressEvent(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
          <SkeletonCard
            variant="generic"
            message="Scanning your digital life"
            subMessage="Detecting available import sources"
            showSpinner
          />
        </div>
      </div>
    );
  }

  // Use detected sources if available, otherwise fall back to defaults
  const viewSources = sources.length > 0 ? mapSources(sources) : DEFAULT_IMPORT_SOURCES;

  return (
    <div className="h-full overflow-y-auto">
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <ImportDigitalLifeView
          isPremium={license.isPremium}
          importSources={viewSources}
          importHistory={mapHistory(history)}
          progress={mapProgress(progressEvent, importingSource !== null)}
          onImport={handleImport}
        />
      </div>
    </div>
  );
}
