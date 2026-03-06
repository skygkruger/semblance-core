/**
 * Import Digital Life View — Settings sub-view for importing external data.
 *
 * Shows import source cards with consent text, file picker, progress bar,
 * and import history. Non-premium users see "Available with Digital Representative".
 */

import { Card, Button } from '@semblance/ui';
import './ImportDigitalLifeView.css';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportSource {
  id: string;
  name: string;
  description: string;
  formats: string;
  consentText: string;
  icon: string;
}

export interface ImportProgress {
  phase: string;
  itemsProcessed: number;
  totalItems: number;
  isActive: boolean;
}

export interface ImportHistoryEntry {
  id: string;
  sourceType: string;
  format: string;
  importedAt: string;
  itemCount: number;
  status: string;
}

interface ImportDigitalLifeViewProps {
  isPremium?: boolean;
  importSources?: ImportSource[];
  importHistory?: ImportHistoryEntry[];
  progress?: ImportProgress | null;
  onImport?: (sourceId: string) => void;
}

// ─── Default Sources ────────────────────────────────────────────────────────

export const DEFAULT_IMPORT_SOURCES: ImportSource[] = [
  {
    id: 'browser_history',
    name: 'Browser History',
    description: 'Import your browsing history from Chrome or Firefox',
    formats: 'Chrome Takeout JSON, Firefox places.sqlite',
    consentText: 'Your browsing history will be indexed locally for search and context.',
    icon: 'globe',
  },
  {
    id: 'notes',
    name: 'Notes',
    description: 'Import notes from Obsidian or Apple Notes',
    formats: 'Markdown folders, Apple Notes HTML export',
    consentText: 'Your notes will be indexed locally. No content leaves your device.',
    icon: 'file-text',
  },
  {
    id: 'photos_metadata',
    name: 'Photos Metadata',
    description: 'Import EXIF data from your photo library',
    formats: 'JPEG, PNG (metadata only)',
    consentText: 'Your photos themselves are never stored. Only metadata (location, date, camera) is indexed.',
    icon: 'image',
  },
  {
    id: 'messaging',
    name: 'Messaging',
    description: 'Import chat exports from WhatsApp',
    formats: 'WhatsApp .txt export',
    consentText: 'Your messages will be indexed locally for search and context.',
    icon: 'message-circle',
  },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ImportDigitalLifeView({
  isPremium = false,
  importSources = DEFAULT_IMPORT_SOURCES,
  importHistory = [],
  progress = null,
  onImport,
}: ImportDigitalLifeViewProps) {
  return (
    <div className="import-life">
      <div>
        <h2 className="import-life__title">Import Digital Life</h2>
        <p className="import-life__subtitle">
          Expand what Semblance knows by importing data from other sources.
          Everything stays on your device.
        </p>
      </div>

      {/* Progress bar */}
      {progress?.isActive && (
        <Card>
          <div className="import-life__progress">
            <div className="import-life__progress-header">
              <span className="import-life__progress-phase">{progress.phase}</span>
              <span className="import-life__progress-count">
                {progress.itemsProcessed} / {progress.totalItems} items
              </span>
            </div>
            <div className="import-life__progress-bar">
              <div
                className="import-life__progress-fill"
                style={{
                  width: `${progress.totalItems > 0 ? (progress.itemsProcessed / progress.totalItems) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Import source cards */}
      <div className="import-life__sources">
        {importSources.map(source => (
          <Card key={source.id}>
            <div className={`import-life__source${!isPremium ? ' import-life__source--locked' : ''}`}>
              <div style={{ flex: 1 }}>
                <h3 className="import-life__source-name">{source.name}</h3>
                <p className="import-life__source-desc">{source.description}</p>
                <p className="import-life__source-formats">Formats: {source.formats}</p>
                <p className="import-life__source-consent">{source.consentText}</p>
              </div>
              <div className="import-life__source-side">
                {isPremium ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onImport?.(source.id)}
                    disabled={progress?.isActive}
                  >
                    Import
                  </Button>
                ) : (
                  <span className="import-life__locked-label">
                    Available with Digital Representative
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Import history */}
      {importHistory && importHistory.length > 0 && (
        <div>
          <h3 className="import-life__history-title">Import History</h3>
          <div className="import-life__history-list">
            {importHistory.map(entry => (
              <div key={entry.id} className="import-life__history-row">
                <span className="import-life__history-source">{entry.sourceType}</span>
                <span className="import-life__history-meta">
                  {entry.itemCount} items · {new Date(entry.importedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
